(function () {
  const page = document.body.dataset.page || "";
  if (page !== "cli" && page !== "labs") return;

  const DEFAULT_INTERFACES = {
    "g0/0": { ip: "unassigned", mask: "", up: false, type: "GigabitEthernet" },
    "g0/1": { ip: "unassigned", mask: "", up: false, type: "GigabitEthernet" }
  };

  const modeLabels = {
    user: "User EXEC",
    privileged: "Privileged EXEC",
    config: "Global Config",
    interface: "Interface Config",
    router_ospf: "Router OSPF Config"
  };

  const state = {
    mode: "user",
    hostname: "RouterLab",
    currentInterface: null,
    interfaces: cloneInterfaces(),
    ospfNetworks: [],
    commandDb: [],
    history: [],
    historyIndex: -1,
    context: null
  };

  const el = {
    output: document.getElementById("cli-output"),
    input: document.getElementById("cli-input"),
    search: document.getElementById("cli-search"),
    searchMode: document.getElementById("cli-search-mode"),
    searchCount: document.getElementById("cli-search-count"),
    searchResult: document.getElementById("cli-search-results"),
    clear: document.getElementById("cli-clear"),
    reset: document.getElementById("cli-reset"),
    modeIndicator: document.getElementById("cli-mode-indicator"),
    quickCommands: document.getElementById("cli-quick-commands")
  };

  if (!el.output || !el.input) return;

  const commandQueue = [];
  let queueRunning = false;

  const aliases = {
    "conf t": "configure terminal",
    conf: "configure terminal",
    "sh run": "show running-config",
    "show run": "show running-config",
    "sh ip int br": "show ip interface brief",
    "sh ip route": "show ip route",
    wr: "write memory",
    "copy running-config startup-config": "write memory"
  };

  function cloneInterfaces() {
    const clone = JSON.parse(JSON.stringify(DEFAULT_INTERFACES));
    Object.entries(clone).forEach(([key, value]) => {
      if (!value.type) {
        value.type = interfaceTypeByKey(key);
      }
    });
    return clone;
  }

  function resetInterfaces() {
    if (state.context && state.context.interfaces) {
      const reset = {};
      Object.entries(state.context.interfaces).forEach(([key, value]) => {
        reset[key] = {
          ip: "unassigned",
          mask: "",
          up: false,
          type: value.type || interfaceTypeByKey(key)
        };
      });
      state.interfaces = reset;
      return;
    }

    state.interfaces = cloneInterfaces();
  }

  function interfaceTypeByKey(key) {
    if (key.startsWith("g")) return "GigabitEthernet";
    if (key.startsWith("fa")) return "FastEthernet";
    if (key.startsWith("s")) return "Serial";
    return "GigabitEthernet";
  }

  function interfaceSuffix(key) {
    return key.replace(/^[a-z]+/i, "");
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function normalizeCommand(value) {
    return String(value || "").trim().replace(/\s+/g, " ");
  }

  function loadContext() {
    try {
      const raw = localStorage.getItem("routeforge.cli.context");
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      return parsed;
    } catch (_error) {
      return null;
    }
  }

  function applyContext(context) {
    if (!context) return;
    state.context = context;
    if (context.hostname) {
      state.hostname = context.hostname;
    }
    if (context.interfaces && typeof context.interfaces === "object") {
      const mapped = {};
      Object.entries(context.interfaces).forEach(([key, value]) => {
        mapped[key] = {
          ip: value.ip || "unassigned",
          mask: value.mask || "",
          up: Boolean(value.up),
          type: value.type || interfaceTypeByKey(key)
        };
      });
      state.interfaces = mapped;
    }
  }

  function persistContext() {
    if (!state.context || !state.context.deviceId) return;
    const payload = {
      ...state.context,
      hostname: state.hostname,
      interfaces: state.interfaces
    };

    try {
      localStorage.setItem("routeforge.cli.context", JSON.stringify(payload));
      const all = JSON.parse(localStorage.getItem("routeforge.cli.contexts") || "{}");
      all[state.context.deviceId] = payload;
      localStorage.setItem("routeforge.cli.contexts", JSON.stringify(all));
    } catch (_error) {
      // ignore
    }
  }

  function promptByMode() {
    if (state.mode === "user") return `${state.hostname}>`;
    if (state.mode === "privileged") return `${state.hostname}#`;
    if (state.mode === "config") return `${state.hostname}(config)#`;
    if (state.mode === "interface") return `${state.hostname}(config-if)#`;
    if (state.mode === "router_ospf") return `${state.hostname}(config-router)#`;
    return `${state.hostname}>`;
  }

  function updateModeIndicator() {
    if (!el.modeIndicator) return;
    const label = modeLabels[state.mode] || "User EXEC";
    el.modeIndicator.textContent = `Mode: ${label}`;
  }

  function writeLine(text, kind = "output") {
    const line = document.createElement("div");
    line.className = "term-line";

    if (kind === "command") {
      line.innerHTML = `<span class="term-prompt">${escapeHtml(promptByMode())}</span> ${escapeHtml(text)}`;
    } else {
      line.innerHTML = `<span class="term-output"></span>`;
      line.querySelector(".term-output").textContent = text;
    }

    el.output.appendChild(line);
    el.output.scrollTop = el.output.scrollHeight;
  }

  function parseIpv4(value) {
    const parts = String(value || "").trim().split(".");
    if (parts.length !== 4) return null;

    const normalized = [];
    for (const part of parts) {
      if (!/^\d+$/.test(part)) return null;
      const octet = Number(part);
      if (!Number.isInteger(octet) || octet < 0 || octet > 255) return null;
      normalized.push(String(octet));
    }

    return normalized.join(".");
  }

  function ipToInt(ip) {
    const parsed = parseIpv4(ip);
    if (!parsed) return null;
    const [a, b, c, d] = parsed.split(".").map(Number);
    return ((a << 24) >>> 0) + ((b << 16) >>> 0) + ((c << 8) >>> 0) + (d >>> 0);
  }

  function intToIp(value) {
    return [
      (value >>> 24) & 255,
      (value >>> 16) & 255,
      (value >>> 8) & 255,
      value & 255
    ].join(".");
  }

  function maskToPrefix(mask) {
    const maskInt = ipToInt(mask);
    if (maskInt === null) return null;
    const binary = maskInt.toString(2).padStart(32, "0");
    if (/01/.test(binary)) return null;
    return binary.split("1").length - 1;
  }

  function wildcardToPrefix(wildcard) {
    const wildcardInt = ipToInt(wildcard);
    if (wildcardInt === null) return null;
    const maskInt = (~wildcardInt) >>> 0;
    const mask = intToIp(maskInt);
    return maskToPrefix(mask);
  }

  function networkFromIpMask(ip, mask) {
    const ipInt = ipToInt(ip);
    const maskInt = ipToInt(mask);
    if (ipInt === null || maskInt === null) return null;
    return intToIp(ipInt & maskInt);
  }

  function resolveInterfaceName(value) {
    const raw = String(value || "")
      .toLowerCase()
      .replace(/\s+/g, "");
    if (!raw) return null;

    const match = raw.match(/^([a-z]+)(\d+(?:\/\d+){0,2})$/);
    if (!match) return null;

    const prefix = match[1];
    const suffix = match[2];
    const map = {
      g: "g",
      gi: "g",
      gigabitethernet: "g",
      f: "fa",
      fa: "fa",
      fastethernet: "fa",
      s: "s",
      se: "s",
      serial: "s"
    };

    const keyPrefix = map[prefix];
    if (!keyPrefix) return null;
    const key = `${keyPrefix}${suffix}`;
    return state.interfaces[key] ? key : null;
  }

  function addHistory(command) {
    if (!command) return;
    if (state.history[state.history.length - 1] !== command) {
      state.history.push(command);
      if (state.history.length > 250) {
        state.history = state.history.slice(-250);
      }
    }
    state.historyIndex = -1;
  }

  function navigateHistory(direction) {
    if (!state.history.length) return;

    if (direction < 0) {
      if (state.historyIndex === -1) {
        state.historyIndex = state.history.length - 1;
      } else {
        state.historyIndex = Math.max(0, state.historyIndex - 1);
      }
      el.input.value = state.history[state.historyIndex];
      return;
    }

    if (state.historyIndex === -1) return;
    state.historyIndex += 1;
    if (state.historyIndex >= state.history.length) {
      state.historyIndex = -1;
      el.input.value = "";
      return;
    }

    el.input.value = state.history[state.historyIndex];
  }

  function clearTerminal() {
    el.output.innerHTML = "";
  }

  function enqueueCommands(commands, options = {}) {
    const list = Array.isArray(commands) ? commands : [commands];
    list
      .map((item) => normalizeCommand(item))
      .filter(Boolean)
      .forEach((cmd) => commandQueue.push(cmd));

    if (options.clear) {
      clearTerminal();
    }

    if (options.focus) {
      el.input.focus();
    }

    if (!queueRunning) {
      processQueue();
    }
  }

  function processQueue() {
    if (!commandQueue.length) {
      queueRunning = false;
      return;
    }

    queueRunning = true;
    const next = commandQueue.shift();
    processCommand(next);
    setTimeout(processQueue, 60);
  }

  function resetDevice() {
    state.mode = "user";
    state.hostname = state.context && state.context.hostname ? state.context.hostname : "RouterLab";
    state.currentInterface = null;
    resetInterfaces();
    state.ospfNetworks = [];
    updateModeIndicator();
    writeLine("Device state reset to defaults.");
    persistContext();
  }

  function renderRunningConfig() {
    const interfaces = Object.entries(state.interfaces)
      .map(([name, data]) => {
        const interfaceName = `${data.type || interfaceTypeByKey(name)}${interfaceSuffix(name)}`;
        const ipLine = data.ip === "unassigned" ? " no ip address" : ` ip address ${data.ip} ${data.mask}`;
        const adminLine = data.up ? " no shutdown" : " shutdown";
        return `interface ${interfaceName}\n${ipLine}\n${adminLine}`;
      })
      .join("\n!\n");

    const ospf = state.ospfNetworks.length
      ? `\n!\nrouter ospf 1\n${state.ospfNetworks.map((network) => ` network ${network}`).join("\n")}`
      : "";

    return `hostname ${state.hostname}\n!\n${interfaces}${ospf}`;
  }

  function renderIpInterfaceBrief() {
    return [
      "Interface              IP-Address      OK? Method Status                Protocol",
      ...Object.entries(state.interfaces).map(([name, data]) => {
        const interfaceName = `${data.type || interfaceTypeByKey(name)}${interfaceSuffix(name)}`.padEnd(22, " ");
        const ip = String(data.ip).padEnd(15, " ");
        const status = data.up ? "up" : "administratively down";
        const protocol = data.up ? "up" : "down";
        return `${interfaceName}${ip}YES manual ${status.padEnd(20, " ")}${protocol}`;
      })
    ].join("\n");
  }

  function renderIpRoute() {
    const connectedRoutes = Object.entries(state.interfaces)
      .filter(([, item]) => item.ip !== "unassigned" && item.mask && item.up)
      .map(([name, item]) => {
        const prefix = maskToPrefix(item.mask);
        const network = networkFromIpMask(item.ip, item.mask);
        const iface = `${item.type || interfaceTypeByKey(name)}${interfaceSuffix(name)}`;
        return `C ${network}/${prefix} is directly connected, ${iface}`;
      });

    const ospfRoutes = state.ospfNetworks.map((statement, index) => {
      const match = statement.match(/^(\S+)\s+(\S+)\s+area\s+(\d+)$/i);
      if (!match) return `O 0.0.0.0/0 [110/20] via 10.0.0.${index + 2}, 00:00:12, GigabitEthernet0/1`;
      const [, network, wildcard] = match;
      const prefix = wildcardToPrefix(wildcard);
      const renderedPrefix = prefix === null ? "24" : String(prefix);
      const firstIface = Object.keys(state.interfaces)[0] || "g0/1";
      const ifaceName = `${interfaceTypeByKey(firstIface)}${interfaceSuffix(firstIface)}`;
      return `O ${network}/${renderedPrefix} [110/20] via 10.0.0.${index + 2}, 00:00:12, ${ifaceName}`;
    });

    const routes = [...connectedRoutes, ...ospfRoutes];
    if (!routes.length) {
      return "Codes: C - connected, O - OSPF\nGateway of last resort is not set\n% No routes installed";
    }

    return ["Codes: C - connected, O - OSPF", ...routes].join("\n");
  }

  function renderOspfNeighbors() {
    if (!state.ospfNetworks.length) {
      return "% OSPF process not active or no neighbors found.";
    }

    return [
      "Neighbor ID     Pri   State           Dead Time   Address         Interface",
      "2.2.2.2           1   FULL/DR         00:00:37    10.0.0.2        GigabitEthernet0/1"
    ].join("\n");
  }

  function renderProtocols() {
    if (!state.ospfNetworks.length) {
      return "Routing Protocol is not configured.";
    }

    return [
      "Routing Protocol is \"ospf 1\"",
      "  Outgoing update filter list for all interfaces is not set",
      "  Incoming update filter list for all interfaces is not set",
      ...state.ospfNetworks.map((network) => `  Routing for Networks: ${network}`)
    ].join("\n");
  }

  function modeAllowsPrivilegedShow() {
    return state.mode === "privileged";
  }

  function runShowCommand(command) {
    const lower = command.toLowerCase();

    if (lower === "show running-config") return renderRunningConfig();
    if (lower === "show startup-config") return renderRunningConfig();
    if (lower === "show ip interface brief") return renderIpInterfaceBrief();
    if (lower === "show ip route") return renderIpRoute();
    if (lower === "show ip ospf neighbor") return renderOspfNeighbors();
    if (lower === "show ip protocols") return renderProtocols();
    if (lower === "show history") {
      if (!state.history.length) return "% No command history.";
      return state.history.map((entry, index) => `${String(index + 1).padStart(3, " ")}  ${entry}`).join("\n");
    }

    return null;
  }

  function setModeForExit() {
    if (state.mode === "interface" || state.mode === "router_ospf") {
      state.mode = "config";
      state.currentInterface = null;
      return;
    }

    if (state.mode === "config") {
      state.mode = "privileged";
      return;
    }

    if (state.mode === "privileged") {
      state.mode = "user";
    }
  }

  function applyAlias(command) {
    const lower = command.toLowerCase();
    return aliases[lower] || command;
  }

  function processCommand(raw) {
    const input = normalizeCommand(raw);
    if (!input) return;

    const command = applyAlias(input);
    const lower = command.toLowerCase();

    addHistory(command);
    writeLine(command, "command");

    if (lower === "clear" || lower === "cls") {
      clearTerminal();
      writeLine("Terminal cleared.");
      return;
    }

    if (lower === "reload") {
      resetDevice();
      return;
    }

    if (lower === "help" || lower === "?") {
      writeLine("Common: enable, disable, configure terminal, interface g0/0, ip address A.B.C.D MASK, no shutdown, router ospf 1, network A.B.C.D WILDCARD area 0, show ip route, show running-config, write memory, end, exit, reload");
      return;
    }

    if (lower === "enable" && state.mode === "user") {
      state.mode = "privileged";
      updateModeIndicator();
      writeLine("Entered privileged EXEC mode.");
      return;
    }

    if (lower === "disable" && state.mode === "privileged") {
      state.mode = "user";
      updateModeIndicator();
      writeLine("Returned to user EXEC mode.");
      return;
    }

    if ((lower === "configure terminal" || lower === "configure") && state.mode === "privileged") {
      state.mode = "config";
      updateModeIndicator();
      writeLine("Enter configuration commands, one per line. End with CNTL/Z.");
      return;
    }

    if (lower === "end" && (state.mode === "config" || state.mode === "interface" || state.mode === "router_ospf")) {
      state.mode = "privileged";
      state.currentInterface = null;
      updateModeIndicator();
      writeLine("Exited to privileged EXEC mode.");
      return;
    }

    if (lower === "exit") {
      setModeForExit();
      updateModeIndicator();
      writeLine("Exit current mode.");
      return;
    }

    if (lower === "write memory" && state.mode === "privileged") {
      writeLine("Building configuration...\n[OK]");
      return;
    }

    const showOutput = runShowCommand(command);
    if (showOutput !== null) {
      if (!modeAllowsPrivilegedShow()) {
        writeLine("% Insufficient privileges for show command in current mode.");
        return;
      }
      writeLine(showOutput);
      return;
    }

    if (lower.startsWith("do ") && (state.mode === "config" || state.mode === "interface" || state.mode === "router_ospf")) {
      const doCommand = command.slice(3);
      const doOutput = runShowCommand(doCommand);
      if (doOutput === null) {
        writeLine("% Invalid do command.");
      } else {
        writeLine(doOutput);
      }
      return;
    }

    if (lower.startsWith("hostname ") && state.mode === "config") {
      const hostname = command.slice(9).trim();
      if (!/^[A-Za-z][A-Za-z0-9_-]{0,29}$/.test(hostname)) {
        writeLine("% Invalid hostname. Use alphanumeric, -, _ and start with a letter.");
        return;
      }

      state.hostname = hostname;
      updateModeIndicator();
      writeLine(`Hostname set to ${hostname}.`);
      persistContext();
      return;
    }

    if (lower.startsWith("interface ") && state.mode === "config") {
      const name = resolveInterfaceName(command.slice("interface ".length).trim());
      if (!name) {
        writeLine("% Interface not supported in this simulator. Use g0/0 or g0/1.");
        return;
      }

      state.currentInterface = name;
      state.mode = "interface";
      updateModeIndicator();
      writeLine(`Configuring interface GigabitEthernet${name.slice(1)}`);
      return;
    }

    if (lower === "no ip address" && state.mode === "interface") {
      if (!state.currentInterface) {
        writeLine("% Interface context missing.");
        return;
      }
      state.interfaces[state.currentInterface].ip = "unassigned";
      state.interfaces[state.currentInterface].mask = "";
      writeLine("IP address removed from interface.");
      persistContext();
      return;
    }

    if (lower.startsWith("ip address ") && state.mode === "interface") {
      if (!state.currentInterface) {
        writeLine("% Interface context missing.");
        return;
      }

      const parts = command.split(/\s+/);
      if (parts.length !== 4) {
        writeLine("% Invalid input. Use: ip address A.B.C.D MASK");
        return;
      }

      const ip = parseIpv4(parts[2]);
      const mask = parseIpv4(parts[3]);
      const prefix = mask ? maskToPrefix(mask) : null;
      if (!ip || !mask || prefix === null || prefix < 1 || prefix > 30) {
        writeLine("% Invalid IP or subnet mask.");
        return;
      }

      state.interfaces[state.currentInterface].ip = ip;
      state.interfaces[state.currentInterface].mask = mask;
      writeLine("IP address applied to interface.");
      persistContext();
      return;
    }

    if (lower === "no shutdown" && state.mode === "interface") {
      if (!state.currentInterface) {
        writeLine("% Interface context missing.");
        return;
      }

      state.interfaces[state.currentInterface].up = true;
      writeLine("Interface state changed to up.");
      persistContext();
      return;
    }

    if (lower === "shutdown" && state.mode === "interface") {
      if (!state.currentInterface) {
        writeLine("% Interface context missing.");
        return;
      }

      state.interfaces[state.currentInterface].up = false;
      writeLine("Interface state changed to administratively down.");
      persistContext();
      return;
    }

    if (lower === "router ospf 1" && state.mode === "config") {
      state.mode = "router_ospf";
      updateModeIndicator();
      writeLine("Entered OSPF router configuration mode.");
      return;
    }

    if (lower.startsWith("network ") && state.mode === "router_ospf") {
      const match = command.match(/^network\s+(\S+)\s+(\S+)\s+area\s+(\d+)$/i);
      if (!match) {
        writeLine("% Invalid network command. Use: network A.B.C.D WILDCARD area N");
        return;
      }

      const statement = `${match[1]} ${match[2]} area ${match[3]}`;
      if (!parseIpv4(match[1]) || !parseIpv4(match[2])) {
        writeLine("% Invalid network or wildcard value.");
        return;
      }

      if (!state.ospfNetworks.includes(statement)) {
        state.ospfNetworks.push(statement);
      }
      writeLine("OSPF network statement added.");
      return;
    }

    if (lower.startsWith("no network ") && state.mode === "router_ospf") {
      const statement = command.replace(/^no\s+/i, "").replace(/^network\s+/i, "");
      const normalized = statement.replace(/\s+/g, " ").trim();
      const index = state.ospfNetworks.findIndex((entry) => entry.toLowerCase() === normalized.toLowerCase());
      if (index === -1) {
        writeLine("% Matching OSPF network statement not found.");
        return;
      }
      state.ospfNetworks.splice(index, 1);
      writeLine("OSPF network statement removed.");
      return;
    }

    writeLine("% Invalid input detected at '^' marker.");
  }

  function availableCommands() {
    const base = [
      "enable",
      "disable",
      "configure terminal",
      "ip address",
      "no ip address",
      "no shutdown",
      "shutdown",
      "router ospf 1",
      "network",
      "show running-config",
      "show startup-config",
      "show ip interface brief",
      "show ip route",
      "show ip ospf neighbor",
      "show ip protocols",
      "show history",
      "write memory",
      "hostname",
      "reload",
      "clear",
      "end",
      "exit"
    ];

    const interfaceCommands = Object.keys(state.interfaces).map((name) => `interface ${name}`);
    const fromDb = state.commandDb.map((item) => item.command);
    const aliasCommands = Object.keys(aliases);
    return [...new Set([...base, ...interfaceCommands, ...fromDb, ...aliasCommands])];
  }

  function autocomplete() {
    const current = normalizeCommand(el.input.value);
    if (!current) return;

    const lower = current.toLowerCase();
    const matches = availableCommands()
      .filter((command) => command.toLowerCase().startsWith(lower))
      .sort((a, b) => a.localeCompare(b));

    if (!matches.length) {
      writeLine("% No autocomplete candidates.");
      return;
    }

    if (matches.length === 1) {
      el.input.value = matches[0];
      return;
    }

    writeLine(matches.slice(0, 12).join("    "));
  }

  function bindTerminal() {
    el.input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        const value = el.input.value;
        el.input.value = "";
        const lines = String(value || "").split(/\n+/).map((item) => item.trim()).filter(Boolean);
        if (lines.length > 1) {
          enqueueCommands(lines, { focus: true });
        } else {
          processCommand(value);
        }
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        navigateHistory(-1);
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        navigateHistory(1);
        return;
      }

      if (event.key === "Tab") {
        event.preventDefault();
        autocomplete();
        return;
      }

      if (event.ctrlKey && event.key.toLowerCase() === "l") {
        event.preventDefault();
        clearTerminal();
        writeLine("Terminal cleared.");
      }
    });

    el.clear.addEventListener("click", () => {
      clearTerminal();
      writeLine("Cisco IOS CLI Simulator ready. Type 'help' for starter commands.");
    });

    if (el.reset) {
      el.reset.addEventListener("click", () => {
        resetDevice();
      });
    }

    if (el.quickCommands) {
      el.quickCommands.addEventListener("click", (event) => {
        const button = event.target.closest("button[data-command]");
        if (!button) return;
        el.input.value = button.dataset.command || "";
        el.input.focus();
      });
    }
  }

  async function loadCommandDatabase() {
    const response = await fetch("/api/cli-commands");
    if (!response.ok) {
      throw new Error(`Command DB request failed: ${response.status}`);
    }

    const data = await response.json();
    state.commandDb = data.commands || [];
  }

  function filterCommands() {
    const query = normalizeCommand(el.search.value).toLowerCase();
    const selectedMode = el.searchMode ? el.searchMode.value : "all";

    let list = state.commandDb;

    if (selectedMode !== "all") {
      if (selectedMode === "any") {
        list = list.filter((item) => item.mode === "any");
      } else {
        list = list.filter((item) => item.mode === selectedMode || item.mode === "any");
      }
    }

    if (query) {
      list = list.filter((item) => {
        return (
          item.command.toLowerCase().includes(query) ||
          item.description.toLowerCase().includes(query)
        );
      });
    }

    return list;
  }

  function renderSearchResults() {
    const list = filterCommands();

    if (el.searchCount) {
      el.searchCount.textContent = `${list.length} command${list.length === 1 ? "" : "s"}`;
    }

    if (!list.length) {
      el.searchResult.innerHTML = "<p class='muted'>No matching commands.</p>";
      return;
    }

    el.searchResult.innerHTML = list
      .slice(0, 20)
      .map((item) => {
        return `<article class="card"><div class="lab-card-top"><strong>${escapeHtml(item.command)}</strong><span class="chip">${escapeHtml(item.mode)}</span></div><p class="muted" style="margin:6px 0 10px;">${escapeHtml(item.description)}</p><div class="toolbar" style="margin:0;"><button class="btn" data-fill-command="${escapeHtml(item.command)}">Insert command</button></div></article>`;
      })
      .join("");
  }

  function bindSearch() {
    el.search.addEventListener("input", renderSearchResults);

    if (el.searchMode) {
      el.searchMode.addEventListener("change", renderSearchResults);
    }

    el.searchResult.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-fill-command]");
      if (!button) return;
      el.input.value = button.dataset.fillCommand || "";
      el.input.focus();
    });
  }

  document.addEventListener("DOMContentLoaded", async () => {
    try {
      await loadCommandDatabase();
      const context = loadContext();
      if (context) {
        applyContext(context);
      }
      bindTerminal();
      bindSearch();
      updateModeIndicator();
      renderSearchResults();
      if (state.context && state.context.label) {
        writeLine(`Connected to ${state.context.label}. Type 'help' for starter commands.`);
      } else {
        writeLine("Cisco IOS CLI Simulator ready. Type 'help' for starter commands.");
      }
      el.input.focus();

      window.RouteForgeCLI = {
        runCommands: (commands, options = {}) => enqueueCommands(commands, options),
        setInput: (value, options = {}) => {
          el.input.value = String(value || "");
          if (options.focus) el.input.focus();
        },
        clear: clearTerminal,
        getHistory: () => [...state.history],
        getState: () => ({
          hostname: state.hostname,
          interfaces: JSON.parse(JSON.stringify(state.interfaces)),
          context: state.context
        })
      };
    } catch (error) {
      writeLine(`Failed to initialize simulator: ${error.message}`);
    }
  });
})();
