
(function () {
  if (document.body.dataset.page !== "topology") return;

  const DEVICE_META = {
    Router: { short: "RTR", family: "router", category: "routers" },
    Switch: { short: "SW", family: "switch", category: "switches" },
    PC: { short: "PC", family: "endpoint", category: "endpoints" },
    Server: { short: "SV", family: "endpoint", category: "endpoints" },
    Firewall: { short: "FW", family: "firewall", category: "security" },
    AccessPoint: { short: "AP", family: "wireless", category: "security" },
    Cloud: { short: "WAN", family: "cloud", category: "wan" },
    Laptop: { short: "LT", family: "endpoint", category: "endpoints" },
    Phone: { short: "PH", family: "endpoint", category: "endpoints" },
    Printer: { short: "PR", family: "endpoint", category: "endpoints" }
  };

  const STORAGE_KEYS = {
    saved: "routeforge.topology.saved",
    current: "routeforge.topology.current",
    cliContexts: "routeforge.cli.contexts",
    cliContext: "routeforge.cli.context",
    recentDevices: "routeforge.topology.recent-devices"
  };

  const supportsPointerEvents = "PointerEvent" in window;
  const supportsCoarsePointer = window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
  const NODE_WIDTH = 128;
  const NODE_HEIGHT = 96;
  const PERSIST_DELAY_MS = 120;

  const state = {
    nodes: [],
    connections: [],
    selectedNodeId: null,
    selectedNodeIds: new Set(),
    connectFrom: null,
    dragOffset: { x: 0, y: 0 },
    movingNodeId: null,
    mode: "move",
    linkType: "ethernet",
    snapToGrid: true,
    gridSize: 20,
    inspectorNodeId: null,
    paletteCategory: "all",
    searchTerm: "",
    persistTimer: null,
    renderQueued: false,
    pendingRender: { nodes: false, connections: false },
    activePointerId: null
  };

  const el = {
    canvas: document.getElementById("topology-canvas"),
    svg: document.getElementById("topology-svg"),
    clear: document.getElementById("topology-clear"),
    hint: document.getElementById("topology-hint"),
    modeMove: document.getElementById("topology-mode-move"),
    modeSelect: document.getElementById("topology-mode-select"),
    modeConnect: document.getElementById("topology-mode-connect"),
    linkType: document.getElementById("topology-link-type"),
    snap: document.getElementById("topology-snap"),
    template: document.getElementById("topology-template"),
    loadTemplate: document.getElementById("topology-load-template"),
    alignLeft: document.getElementById("topology-align-left"),
    alignTop: document.getElementById("topology-align-top"),
    distributeH: document.getElementById("topology-distribute-h"),
    distributeV: document.getElementById("topology-distribute-v"),
    saveName: document.getElementById("topology-save-name"),
    saveBtn: document.getElementById("topology-save"),
    savedList: document.getElementById("topology-saved-list"),
    loadBtn: document.getElementById("topology-load"),
    exportBtn: document.getElementById("topology-export"),
    importInput: document.getElementById("topology-import"),
    emptyState: document.getElementById("topology-empty-state"),
    deviceCount: document.getElementById("topology-device-count"),
    linkCount: document.getElementById("topology-link-count"),
    selectedCount: document.getElementById("topology-selected-count"),
    modeLabel: document.getElementById("topology-mode-label"),
    cableLabel: document.getElementById("topology-cable-label"),
    cableButtons: Array.from(document.querySelectorAll("[data-link-type]")),
    filterButtons: Array.from(document.querySelectorAll(".topology-filter")),
    paletteGroups: Array.from(document.querySelectorAll(".topology-palette-group")),
    paletteItems: Array.from(document.querySelectorAll(".device-item")),
    deviceSearch: document.getElementById("topology-device-search"),
    dockAvailable: document.getElementById("topology-dock-available"),
    dockOnCanvas: document.getElementById("topology-dock-on-canvas"),
    dockLastAdded: document.getElementById("topology-dock-last-added"),
    quickPickButtons: Array.from(document.querySelectorAll("[data-quick-device]")),
    recentDevices: document.getElementById("topology-recent-devices"),
    groupToggleButtons: Array.from(document.querySelectorAll("[data-group-toggle]")),
    inspectorTitle: document.getElementById("inspector-device-title"),
    inspectorMeta: document.getElementById("inspector-device-meta"),
    cliBackdrop: document.getElementById("topology-cli-backdrop"),
    cliTitle: document.getElementById("topology-cli-title"),
    cliMeta: document.getElementById("topology-cli-meta"),
    cliOpenPage: document.getElementById("topology-cli-open-page"),
    cliClose: document.getElementById("topology-cli-close"),
    inspectorEmpty: document.getElementById("inspector-empty"),
    inspectorPanel: document.getElementById("inspector-panel"),
    inspectorOpenCli: document.getElementById("inspector-open-cli"),
    inspectorExport: document.getElementById("inspector-export-config"),
    inspectorDelete: document.getElementById("inspector-delete"),
    inspectorLabel: document.getElementById("inspector-label"),
    inspectorHostname: document.getElementById("inspector-hostname"),
    inspectorMgmtIp: document.getElementById("inspector-mgmt-ip"),
    inspectorRole: document.getElementById("inspector-role"),
    inspectorNotes: document.getElementById("inspector-notes"),
    inspectorRoutes: document.getElementById("inspector-routes"),
    inspectorVlans: document.getElementById("inspector-vlans"),
    inspectorPorts: document.getElementById("inspector-ports")
  };

  const templates = [
    {
      id: "branch-ospf",
      name: "Branch OSPF (3 routers, 2 switches)",
      build: () => {
        const r1 = createNode("Router", "ISR 4331", 120, 120, { label: "R1" });
        const r2 = createNode("Router", "ISR 4331", 420, 80, { label: "R2" });
        const r3 = createNode("Router", "ISR 4331", 420, 220, { label: "R3" });
        const sw1 = createNode("Switch", "Catalyst 2960", 120, 260, { label: "SW1" });
        const sw2 = createNode("Switch", "Catalyst 2960", 520, 260, { label: "SW2" });
        createConnection(r1, "g0/0", r2, "g0/0", "ethernet");
        createConnection(r1, "g0/1", r3, "g0/0", "ethernet");
        createConnection(r2, "g0/1", sw2, "g0/1", "ethernet");
        createConnection(r3, "g0/1", sw1, "g0/1", "ethernet");
        return { nodes: state.nodes, connections: state.connections };
      }
    },
    {
      id: "nat-edge",
      name: "NAT Edge (Router, Firewall, LAN)",
      build: () => {
        const cloud = createNode("Cloud", "Internet", 520, 60, { label: "ISP" });
        const fw = createNode("Firewall", "ASA 5506-X", 320, 120, { label: "FW1" });
        const r1 = createNode("Router", "ISR 2911", 140, 140, { label: "R1" });
        const sw = createNode("Switch", "Catalyst 2960", 140, 260, { label: "SW1" });
        createConnection(cloud, "eth0", fw, "g0/0", "ethernet");
        createConnection(fw, "g0/1", r1, "g0/0", "ethernet");
        createConnection(r1, "g0/1", sw, "g0/1", "ethernet");
        return { nodes: state.nodes, connections: state.connections };
      }
    },
    {
      id: "hsrp-campus",
      name: "HSRP Campus (2 routers, 2 switches, PCs)",
      build: () => {
        const r1 = createNode("Router", "ISR 4331", 120, 100, { label: "R1" });
        const r2 = createNode("Router", "ISR 4331", 320, 100, { label: "R2" });
        const sw1 = createNode("Switch", "Catalyst 3560", 120, 230, { label: "SW1" });
        const sw2 = createNode("Switch", "Catalyst 3560", 320, 230, { label: "SW2" });
        const pc1 = createNode("PC", "Windows PC", 80, 360, { label: "PC1" });
        const pc2 = createNode("PC", "Windows PC", 280, 360, { label: "PC2" });
        createConnection(r1, "g0/0", sw1, "g0/1", "ethernet");
        createConnection(r2, "g0/0", sw2, "g0/1", "ethernet");
        createConnection(sw1, "fa0/1", pc1, "eth0", "ethernet");
        createConnection(sw2, "fa0/1", pc2, "eth0", "ethernet");
        return { nodes: state.nodes, connections: state.connections };
      }
    },
    {
      id: "wireless-branch",
      name: "Wireless Branch (AP, Switch, Laptop, Phone)",
      build: () => {
        const sw = createNode("Switch", "Catalyst 2960", 220, 160, { label: "SW1" });
        const ap = createNode("AccessPoint", "Aironet 1830", 420, 120, { label: "AP1" });
        const laptop = createNode("Laptop", "Laptop", 520, 60, { label: "LT1" });
        const phone = createNode("Phone", "IP Phone", 520, 200, { label: "PH1" });
        createConnection(sw, "g0/1", ap, "g0/0", "ethernet");
        createConnection(ap, "wlan0", laptop, "wifi0", "wireless");
        createConnection(ap, "wlan0", phone, "wifi0", "wireless");
        return { nodes: state.nodes, connections: state.connections };
      }
    }
  ];

  function nextId(prefix) {
    return `${prefix}-${Math.random().toString(16).slice(2, 8)}`;
  }

  function canvasRect() {
    return el.canvas.getBoundingClientRect();
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function snapValue(value) {
    if (!state.snapToGrid) return value;
    return Math.round(value / state.gridSize) * state.gridSize;
  }

  function setHint(text) {
    if (el.hint) el.hint.textContent = text;
  }

  function schedulePersistCurrentTopology(immediate = false) {
    if (state.persistTimer) {
      clearTimeout(state.persistTimer);
      state.persistTimer = null;
    }

    if (immediate) {
      persistCurrentTopology();
      return;
    }

    state.persistTimer = setTimeout(() => {
      state.persistTimer = null;
      persistCurrentTopology();
    }, PERSIST_DELAY_MS);
  }

  function queueRender(options = {}) {
    state.pendingRender.nodes = state.pendingRender.nodes || Boolean(options.nodes);
    state.pendingRender.connections = state.pendingRender.connections || Boolean(options.connections);
    if (state.renderQueued) return;

    state.renderQueued = true;
    requestAnimationFrame(() => {
      state.renderQueued = false;
      const shouldRenderNodes = state.pendingRender.nodes;
      const shouldRenderConnections = state.pendingRender.connections;
      state.pendingRender.nodes = false;
      state.pendingRender.connections = false;

      if (shouldRenderNodes) renderNodes();
      if (shouldRenderConnections) renderConnections();
    });
  }

  function deviceMeta(type) {
    return DEVICE_META[type] || { short: "DEV", family: "endpoint", category: "all" };
  }

  function updateWorkspaceStats() {
    if (el.deviceCount) el.deviceCount.textContent = String(state.nodes.length);
    if (el.linkCount) el.linkCount.textContent = String(state.connections.length);
    if (el.selectedCount) el.selectedCount.textContent = String(state.selectedNodeIds.size);
    if (el.modeLabel) {
      el.modeLabel.textContent = state.mode === "connect"
        ? "Connect"
        : state.mode === "select"
          ? "Select"
          : "Move";
    }
    if (el.cableLabel) {
      const value = state.linkType || "ethernet";
      el.cableLabel.textContent = value.charAt(0).toUpperCase() + value.slice(1);
    }
    if (el.emptyState) {
      el.emptyState.classList.toggle("is-hidden", state.nodes.length > 0);
    }
    updateDockOverview();
  }

  function readRecentDevices() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEYS.recentDevices) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (_error) {
      return [];
    }
  }

  function writeRecentDevices(list) {
    try {
      localStorage.setItem(STORAGE_KEYS.recentDevices, JSON.stringify(list));
    } catch (_error) {
      // ignore
    }
  }

  function pushRecentDevice(type, model) {
    const entry = {
      type,
      model: model || "",
      category: deviceMeta(type).category
    };
    const next = readRecentDevices()
      .filter((item) => !(item.type === entry.type && item.model === entry.model))
      .slice(0, 5);
    next.unshift(entry);
    writeRecentDevices(next.slice(0, 5));
    renderRecentDevices();
  }

  function renderRecentDevices() {
    if (!el.recentDevices) return;
    const recent = readRecentDevices();
    if (!recent.length) {
      el.recentDevices.innerHTML = '<p class="muted topology-recent-empty">Add a few devices and they will appear here for quick reuse.</p>';
      return;
    }

    el.recentDevices.innerHTML = recent
      .map((item) => {
        const title = item.model || item.type;
        const category = item.category || deviceMeta(item.type).category;
        return `
          <div class="topology-recent-chip">
            <div>
              <strong>${title}</strong>
              <span>${category.charAt(0).toUpperCase() + category.slice(1)}</span>
            </div>
            <button type="button" data-recent-device="${item.type}" data-recent-model="${item.model || ""}">Add</button>
          </div>
        `;
      })
      .join("");
  }

  function updateDockOverview() {
    if (el.dockAvailable) {
      const visibleInventory = el.paletteItems.filter((item) => !item.hidden).length;
      el.dockAvailable.textContent = String(visibleInventory);
    }
    if (el.dockOnCanvas) {
      el.dockOnCanvas.textContent = String(state.nodes.length);
    }
    if (el.dockLastAdded) {
      const lastNode = state.nodes[state.nodes.length - 1];
      el.dockLastAdded.textContent = lastNode ? (lastNode.model || lastNode.type) : "None";
    }
  }

  function isCliModalOpen() {
    return Boolean(el.cliBackdrop && !el.cliBackdrop.classList.contains("is-hidden"));
  }

  function buildCliContext(node) {
    let savedContext = null;
    try {
      const all = JSON.parse(localStorage.getItem(STORAGE_KEYS.cliContexts) || "{}");
      savedContext = all[node.id] || null;
    } catch (_error) {
      savedContext = null;
    }

    const interfaces = {};
    node.ports.forEach((p) => {
      if (p.id.startsWith("g") || p.id.startsWith("fa") || p.id.startsWith("s")) {
        let ipValue = p.ip || "unassigned";
        let maskValue = p.mask || "";
        if (ipValue.includes("/")) {
          const parts = ipValue.split("/");
          ipValue = parts[0];
          maskValue = maskValue || prefixToMask(parts[1]);
        }
        interfaces[p.id] = {
          ip: ipValue,
          mask: maskValue,
          up: Boolean(p.up),
          type: p.id.startsWith("g") ? "GigabitEthernet" : p.id.startsWith("fa") ? "FastEthernet" : "Serial"
        };
      }
    });

    return {
      deviceId: node.id,
      label: node.label,
      hostname: node.config.hostname || node.label,
      type: node.type,
      model: node.model || "",
      interfaces,
      ospfNetworks: Array.isArray(savedContext?.ospfNetworks)
        ? [...savedContext.ospfNetworks]
        : Array.isArray(node.config.ospfNetworks)
          ? [...node.config.ospfNetworks]
          : []
    };
  }

  function persistCliContext(context) {
    try {
      localStorage.setItem(STORAGE_KEYS.cliContext, JSON.stringify(context));
      const all = JSON.parse(localStorage.getItem(STORAGE_KEYS.cliContexts) || "{}");
      all[context.deviceId] = {
        ...(all[context.deviceId] || {}),
        ...context
      };
      localStorage.setItem(STORAGE_KEYS.cliContexts, JSON.stringify(all));
    } catch (_error) {
      // ignore
    }
  }

  function openCliModal(node, context) {
    if (!el.cliBackdrop) return false;
    if (!window.RouteForgeCLI || typeof window.RouteForgeCLI.setContext !== "function") {
      return false;
    }

    if (el.cliTitle) {
      el.cliTitle.textContent = `${node.label || node.model || node.type} Console`;
    }
    if (el.cliMeta) {
      el.cliMeta.textContent = `${node.type}${node.model ? ` - ${node.model}` : ""} | ${Object.keys(context.interfaces).length} interface${Object.keys(context.interfaces).length === 1 ? "" : "s"}`;
    }
    if (el.cliOpenPage) {
      el.cliOpenPage.href = "cli-simulator.html";
    }

    el.cliBackdrop.classList.remove("is-hidden");
    window.RouteForgeCLI.setContext(context, { clear: true, announce: true, focus: true });
    return true;
  }

  function closeCliModal() {
    if (!el.cliBackdrop) return;
    el.cliBackdrop.classList.add("is-hidden");
  }

  function updateLinkTypeButtons() {
    el.cableButtons.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.linkType === state.linkType);
    });
    if (el.linkType && el.linkType.value !== state.linkType) {
      el.linkType.value = state.linkType;
    }
    updateWorkspaceStats();
  }

  function nextPlacement() {
    const rect = canvasRect();
    const margin = 32;
    const columnWidth = 148;
    const rowHeight = 112;
    const perRow = Math.max(1, Math.floor((rect.width - margin * 2) / columnWidth));
    const index = state.nodes.length;
    const x = margin + (index % perRow) * columnWidth;
    const y = margin + Math.floor(index / perRow) * rowHeight;
    return {
      x: clamp(snapValue(x), 0, Math.max(0, rect.width - NODE_WIDTH)),
      y: clamp(snapValue(y), 0, Math.max(0, rect.height - NODE_HEIGHT))
    };
  }

  function addDeviceFromPalette(type, model) {
    const { x, y } = nextPlacement();
    createNode(type, model, x, y, { label: model || type });
    pushRecentDevice(type, model);
    renderNodes();
    renderConnections();
    schedulePersistCurrentTopology();
    setHint(`${model || type} added. ${state.mode === "connect" ? "Click ports to connect." : "Drag to position."}`);
  }

  function applyPaletteFilters() {
    const query = state.searchTerm.trim().toLowerCase();

    el.paletteItems.forEach((item) => {
      const categoryMatches = state.paletteCategory === "all" || item.dataset.category === state.paletteCategory;
      const haystack = `${item.dataset.device || ""} ${item.dataset.model || ""} ${item.textContent || ""}`.toLowerCase();
      const searchMatches = !query || haystack.includes(query);
      item.hidden = !(categoryMatches && searchMatches);
    });

    el.paletteGroups.forEach((group) => {
      const visibleItems = Array.from(group.querySelectorAll(".device-item")).some((item) => !item.hidden);
      group.hidden = !visibleItems;
    });
  }

  function port(id, media, label) {
    return {
      id,
      label: label || id,
      media,
      up: false,
      ip: "",
      mask: "",
      vlan: "",
      speed: ""
    };
  }

  function defaultPorts(type) {
    switch (type) {
      case "Router":
        return [
          port("g0/0", "ethernet"),
          port("g0/1", "ethernet"),
          port("s0/0/0", "serial"),
          port("s0/0/1", "serial")
        ];
      case "Switch":
        return [
          port("fa0/1", "ethernet"),
          port("fa0/2", "ethernet"),
          port("fa0/3", "ethernet"),
          port("fa0/4", "ethernet"),
          port("g0/1", "ethernet"),
          port("g0/2", "ethernet")
        ];
      case "Firewall":
        return [
          port("g0/0", "ethernet", "outside"),
          port("g0/1", "ethernet", "inside")
        ];
      case "AccessPoint":
        return [
          port("g0/0", "ethernet"),
          port("wlan0", "wireless")
        ];
      case "Laptop":
        return [
          port("eth0", "ethernet"),
          port("wifi0", "wireless")
        ];
      case "PC":
      case "Server":
      case "Printer":
        return [port("eth0", "ethernet")];
      case "Phone":
        return [port("wifi0", "wireless")];
      case "Cloud":
        return [port("eth0", "ethernet"), port("s0/0/0", "serial")];
      default:
        return [port("eth0", "ethernet")];
    }
  }

  function createNode(type, model, x, y, options = {}) {
    const labelBase = options.label || model || type;
    const node = {
      id: options.id || nextId(type.toLowerCase()),
      type,
      model: model || "",
      x,
      y,
      label: labelBase,
      config: {
        hostname: options.hostname || labelBase,
        mgmtIp: options.mgmtIp || "",
        role: options.role || "",
        notes: options.notes || "",
        routes: options.routes || "",
        vlans: options.vlans || ""
      },
      ports: options.ports || defaultPorts(type)
    };

    state.nodes.push(node);
    return node;
  }

  function getNode(nodeId) {
    return state.nodes.find((node) => node.id === nodeId) || null;
  }

  function nodeCenter(node) {
    return { x: node.x + NODE_WIDTH / 2, y: node.y + NODE_HEIGHT / 2 - 8 };
  }

  function isPortUsed(nodeId, portId) {
    return state.connections.some((conn) => {
      return (conn.from === nodeId && conn.fromPort === portId) ||
        (conn.to === nodeId && conn.toPort === portId);
    });
  }

  function isPortBlocked(nodeId, portId, cableType) {
    const node = getNode(nodeId);
    const portItem = getPort(node, portId);
    if (portAllowsMultipleLinks(node, portId, cableType)) {
      return false;
    }
    return isPortUsed(nodeId, portId);
  }

  function getPort(node, portId) {
    if (!node) return null;
    return node.ports.find((p) => p.id === portId) || null;
  }

  function portCompatible(portA, portB, cableType) {
    if (!portA || !portB) return false;
    if (cableType === "wireless") {
      return portA.media === "wireless" && portB.media === "wireless";
    }
    if (cableType === "serial") {
      return portA.media === "serial" && portB.media === "serial";
    }
    if (cableType === "fiber") {
      return portA.media === "ethernet" && portB.media === "ethernet";
    }
    return portA.media === "ethernet" && portB.media === "ethernet";
  }

  function portSupportsCable(portItem, cableType) {
    if (!portItem) return false;
    if (cableType === "wireless") return portItem.media === "wireless";
    if (cableType === "serial") return portItem.media === "serial";
    return portItem.media === "ethernet";
  }

  function portAllowsMultipleLinks(node, portId, cableType) {
    const portItem = getPort(node, portId);
    if (!node || !portItem) return false;
    return cableType === "wireless" && node.type === "AccessPoint" && portItem.media === "wireless";
  }

  function connectionExists(nodeAId, portAId, nodeBId, portBId) {
    return state.connections.some((conn) => {
      const forward = conn.from === nodeAId && conn.fromPort === portAId && conn.to === nodeBId && conn.toPort === portBId;
      const reverse = conn.from === nodeBId && conn.fromPort === portBId && conn.to === nodeAId && conn.toPort === portAId;
      return forward || reverse;
    });
  }

  function validateConnection(nodeA, portAId, nodeB, portBId, cableType) {
    if (!nodeA || !nodeB) {
      return { ok: false, message: "Both devices must exist before creating a connection." };
    }

    const portA = getPort(nodeA, portAId);
    const portB = getPort(nodeB, portBId);
    if (!portA || !portB) {
      return { ok: false, message: "One of the selected ports could not be found." };
    }

    if (!portSupportsCable(portA, cableType) || !portSupportsCable(portB, cableType)) {
      return { ok: false, message: "Cable type not compatible with selected ports." };
    }

    if (nodeA.id === nodeB.id) {
      return { ok: false, message: "Choose a port on a different device to create a connection." };
    }

    if (!deviceAllowsCable(nodeA, nodeB, cableType)) {
      return { ok: false, message: "Cable type not supported between these device types." };
    }

    if (connectionExists(nodeA.id, portAId, nodeB.id, portBId)) {
      return { ok: false, message: "Those ports are already connected." };
    }

    if (isPortBlocked(nodeA.id, portAId, cableType) || isPortBlocked(nodeB.id, portBId, cableType)) {
      return { ok: false, message: "One of the selected ports is already in use." };
    }

    return { ok: true, message: "" };
  }

  function getPortConnectionState(node, portItem) {
    if (!portItem) return "invalid";

    if (!state.connectFrom) {
      if (state.mode === "connect" && !portSupportsCable(portItem, state.linkType)) {
        return "disabled";
      }
      if (state.mode === "connect" && isPortBlocked(node.id, portItem.id, state.linkType)) {
        return "used";
      }
      return "idle";
    }

    if (state.connectFrom.nodeId === node.id && state.connectFrom.portId === portItem.id) {
      return "source";
    }

    const sourceNode = getNode(state.connectFrom.nodeId);
    const sourcePortId = state.connectFrom.portId;
    const validation = validateConnection(sourceNode, sourcePortId, node, portItem.id, state.linkType);
    return validation.ok ? "target" : "invalid";
  }

  function deviceAllowsCable(deviceA, deviceB, cableType) {
    const typeA = deviceA.type;
    const typeB = deviceB.type;
    if (cableType === "serial") {
      return (typeA === "Router" || typeA === "Cloud") && (typeB === "Router" || typeB === "Cloud");
    }
    if (cableType === "wireless") {
      const wirelessEndpoints = new Set(["Laptop", "Phone", "PC"]);
      const hasAp = typeA === "AccessPoint" || typeB === "AccessPoint";
      const hasEndpoint = wirelessEndpoints.has(typeA) || wirelessEndpoints.has(typeB);
      return hasAp && hasEndpoint;
    }
    return true;
  }

  function createConnection(nodeA, portAId, nodeB, portBId, cableType) {
    const validation = validateConnection(nodeA, portAId, nodeB, portBId, cableType);
    if (!validation.ok) {
      setHint(validation.message);
      return false;
    }
    state.connections.push({
      id: nextId("link"),
      from: nodeA.id,
      to: nodeB.id,
      fromPort: portAId,
      toPort: portBId,
      type: cableType
    });
    return true;
  }

  function beginNodeDrag(node, event) {
    if (state.mode !== "move") return;
    if (supportsPointerEvents) {
      if (!event.isPrimary || event.button !== 0) return;
      state.activePointerId = event.pointerId;
    } else if (event.button !== 0) {
      return;
    }

    const rect = canvasRect();
    state.movingNodeId = node.id;
    state.dragOffset = {
      x: event.clientX - rect.left - node.x,
      y: event.clientY - rect.top - node.y
    };

    if (supportsPointerEvents && event.currentTarget && typeof event.currentTarget.setPointerCapture === "function") {
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch (_error) {
        // ignore capture issues
      }
    }

    if (event.preventDefault) {
      event.preventDefault();
    }
  }

  function moveDraggedNode(event) {
    if (!state.movingNodeId) return;
    if (supportsPointerEvents && state.activePointerId !== event.pointerId) return;

    const node = getNode(state.movingNodeId);
    if (!node) return;

    const rect = canvasRect();
    const nextX = clamp(snapValue(event.clientX - rect.left - state.dragOffset.x), 0, Math.max(0, rect.width - NODE_WIDTH));
    const nextY = clamp(snapValue(event.clientY - rect.top - state.dragOffset.y), 0, Math.max(0, rect.height - NODE_HEIGHT));

    node.x = nextX;
    node.y = nextY;
    queueRender({ nodes: true, connections: true });
  }

  function finishNodeDrag(event) {
    if (!state.movingNodeId) return;
    if (supportsPointerEvents && state.activePointerId !== event.pointerId) return;

    renderNodes();
    renderConnections();
    schedulePersistCurrentTopology(true);
    state.movingNodeId = null;
    state.activePointerId = null;
  }

  function renderNodes() {
    Array.from(el.canvas.querySelectorAll(".node")).forEach((node) => node.remove());
    state.nodes.forEach((node) => {
      const meta = deviceMeta(node.type);
      const div = document.createElement("div");
      div.className = `node node-family-${meta.family}`;
      if (state.selectedNodeIds.has(node.id)) {
        div.classList.add("is-selected");
      }
      div.style.left = `${node.x}px`;
      div.style.top = `${node.y}px`;
      div.dataset.nodeId = node.id;

      const portsHtml = node.ports
        .map((p) => {
          const classes = ["port-chip"];
          const connectionState = getPortConnectionState(node, p);
          if (isPortUsed(node.id, p.id)) classes.push("is-used");
          if (p.up) classes.push("is-up");
          if (!p.up && (p.ip || p.vlan)) classes.push("is-down");
          if (connectionState === "source") classes.push("is-selected", "is-source");
          if (connectionState === "target") classes.push("is-connect-target");
          if (connectionState === "invalid") classes.push("is-connect-invalid");
          if (connectionState === "disabled") classes.push("is-disabled");
          return `<button class="${classes.join(" ")}" data-port="${p.id}" type="button">${p.label}</button>`;
        })
        .join("");

      div.innerHTML = `
        <div class="node-card">
          <div class="node-head">
            <div class="node-icon">${meta.short}</div>
            <div class="node-copy">
              <span class="node-label">${node.label}</span>
              <span class="node-model">${node.model || node.type}</span>
            </div>
          </div>
          <div class="node-ports">${portsHtml}</div>
        </div>
      `;

      if (supportsPointerEvents) {
        div.addEventListener("pointerdown", (event) => {
          beginNodeDrag(node, event);
        });
      } else {
        div.addEventListener("mousedown", (event) => {
          beginNodeDrag(node, event);
        });
      }

      div.addEventListener("click", (event) => {
        const portButton = event.target.closest("[data-port]");
        if (portButton) {
          event.stopPropagation();
          handlePortClick(node.id, portButton.dataset.port);
          return;
        }
        handleNodeClick(node.id, event);
      });

      div.addEventListener("dblclick", (event) => {
        if (state.mode === "connect") return;
        if (event.target.closest("[data-port]")) return;
        event.preventDefault();
        event.stopPropagation();
        openCliForNode(node);
      });

      el.canvas.appendChild(div);
    });
    updateWorkspaceStats();
  }

  function renderConnections() {
    el.svg.innerHTML = "";
    state.connections.forEach((conn) => {
      const from = getNode(conn.from);
      const to = getNode(conn.to);
      if (!from || !to) return;

      const p1 = nodeCenter(from);
      const p2 = nodeCenter(to);
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", p1.x);
      line.setAttribute("y1", p1.y);
      line.setAttribute("x2", p2.x);
      line.setAttribute("y2", p2.y);
      line.classList.add(`link-${conn.type || "ethernet"}`);
      el.svg.appendChild(line);

      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.setAttribute("x", (p1.x + p2.x) / 2 + 6);
      label.setAttribute("y", (p1.y + p2.y) / 2 - 6);
      label.classList.add("link-label");
      label.textContent = `${conn.fromPort} <-> ${conn.toPort}`;
      el.svg.appendChild(label);
    });
  }

  function handlePortClick(nodeId, portId) {
    const node = getNode(nodeId);
    const portItem = getPort(node, portId);

    if (state.mode !== "connect") {
      setHint("Switch to Connect mode to use cable connections.");
      return;
    }

    if (!node || !portItem) {
      setHint("That port is no longer available.");
      return;
    }

    if (!portSupportsCable(portItem, state.linkType)) {
      setHint(`The active ${state.linkType} cable does not work with ${portItem.label}.`);
      return;
    }

    if (!state.connectFrom && isPortBlocked(nodeId, portId, state.linkType)) {
      setHint("Selected port is already used. Choose another port.");
      return;
    }

    if (!state.connectFrom) {
      state.connectFrom = { nodeId, portId };
      renderNodes();
      setHint(`Source selected: ${node.label} ${portItem.label}. Choose a destination port.`);
      return;
    }

    if (state.connectFrom.nodeId === nodeId && state.connectFrom.portId === portId) {
      state.connectFrom = null;
      renderNodes();
      setHint("Cable selection cleared.");
      return;
    }

    if (state.connectFrom.nodeId === nodeId) {
      state.connectFrom = { nodeId, portId };
      renderNodes();
      setHint(`Source changed: ${node.label} ${portItem.label}. Choose a destination port.`);
      return;
    }

    const nodeA = getNode(state.connectFrom.nodeId);
    const sourcePort = getPort(nodeA, state.connectFrom.portId);
    const validation = validateConnection(nodeA, state.connectFrom.portId, node, portId, state.linkType);
    if (!validation.ok) {
      renderNodes();
      setHint(validation.message);
      return;
    }

    const created = createConnection(nodeA, state.connectFrom.portId, node, portId, state.linkType);
    if (created) {
      renderConnections();
      setHint(`${state.linkType.toUpperCase()} link created: ${nodeA.label} ${sourcePort?.label || state.connectFrom.portId} -> ${node.label} ${portItem.label}.`);
    }
    state.connectFrom = null;
    renderNodes();
    schedulePersistCurrentTopology();
  }

  function handleNodeClick(nodeId, event) {
    if (state.mode === "connect") {
      setHint("Select a port to connect. Click port chips on the device.");
      return;
    }

    if (event.shiftKey || state.mode === "select") {
      if (state.selectedNodeIds.has(nodeId)) {
        state.selectedNodeIds.delete(nodeId);
      } else {
        state.selectedNodeIds.add(nodeId);
      }
    } else {
      state.selectedNodeIds.clear();
      state.selectedNodeIds.add(nodeId);
    }

    state.selectedNodeId = nodeId;
    state.inspectorNodeId = nodeId;
    renderNodes();
    updateInspector();
  }

  function clearSelection() {
    state.selectedNodeIds.clear();
    state.selectedNodeId = null;
    state.inspectorNodeId = null;
    renderNodes();
    updateInspector();
    updateWorkspaceStats();
  }

  function bindPaletteDnD() {
    Array.from(document.querySelectorAll(".device-item")).forEach((item) => {
      item.addEventListener("dragstart", (event) => {
        event.dataTransfer.setData("text/plain", JSON.stringify({
          device: item.dataset.device,
          model: item.dataset.model || ""
        }));
      });

      item.addEventListener("dblclick", () => {
        addDeviceFromPalette(item.dataset.device, item.dataset.model || "");
      });

      const addButton = item.querySelector("[data-add-device]");
      if (addButton) {
        addButton.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          addDeviceFromPalette(item.dataset.device, item.dataset.model || "");
        });
      }

      if (supportsCoarsePointer) {
        item.addEventListener("click", (event) => {
          if (event.target.closest("[data-add-device]")) return;
          addDeviceFromPalette(item.dataset.device, item.dataset.model || "");
        });
      }
    });

    el.canvas.addEventListener("dragover", (event) => {
      event.preventDefault();
    });

    el.canvas.addEventListener("drop", (event) => {
      event.preventDefault();
      const payload = event.dataTransfer.getData("text/plain");
      if (!payload) return;
      let type = "";
      let model = "";
      try {
        const parsed = JSON.parse(payload);
        type = parsed.device;
        model = parsed.model || "";
      } catch (_error) {
        type = payload;
      }
      if (!type) return;

      const rect = canvasRect();
      const x = clamp(snapValue(event.clientX - rect.left - 46), 0, rect.width - NODE_WIDTH);
      const y = clamp(snapValue(event.clientY - rect.top - 34), 0, rect.height - NODE_HEIGHT);
      createNode(type, model, x, y, { label: `${model || type}` });
      renderNodes();
      renderConnections();
      schedulePersistCurrentTopology();
      setHint(`${model || type} added. ${state.mode === "connect" ? "Click ports to connect." : "Drag to position."}`);
    });
  }

  function bindMove() {
    if (supportsPointerEvents) {
      document.addEventListener("pointermove", moveDraggedNode);
      document.addEventListener("pointerup", finishNodeDrag);
      document.addEventListener("pointercancel", finishNodeDrag);
      return;
    }

    document.addEventListener("mousemove", moveDraggedNode);
    document.addEventListener("mouseup", finishNodeDrag);
  }

  function bindClear() {
    el.clear.addEventListener("click", () => {
      state.nodes = [];
      state.connections = [];
      state.selectedNodeId = null;
      state.selectedNodeIds.clear();
      state.connectFrom = null;
      renderNodes();
      renderConnections();
      updateInspector();
      schedulePersistCurrentTopology(true);
      setHint("Canvas cleared.");
    });
  }

  function setMode(mode) {
    state.mode = mode;
    state.connectFrom = null;
    if (mode === "connect") {
      setHint("Connect mode: pick a cable type and click two device ports.");
    } else if (mode === "select") {
      setHint("Select mode: tap devices to add or remove them from the selection.");
    } else {
      setHint("Move mode: drag devices with your mouse or finger. Use Select mode or Shift+Click to multi-select.");
    }
    if (el.modeMove) el.modeMove.classList.toggle("btn-primary", mode === "move");
    if (el.modeSelect) el.modeSelect.classList.toggle("btn-primary", mode === "select");
    if (el.modeConnect) el.modeConnect.classList.toggle("btn-primary", mode === "connect");
    renderNodes();
    updateWorkspaceStats();
  }

  function setLinkType(linkType) {
    state.linkType = linkType || "ethernet";
    if (state.connectFrom) {
      const sourceNode = getNode(state.connectFrom.nodeId);
      const sourcePort = getPort(sourceNode, state.connectFrom.portId);
      if (!portSupportsCable(sourcePort, state.linkType)) {
        state.connectFrom = null;
        setHint(`Active cable changed to ${state.linkType}. Previous source selection was cleared.`);
      }
    }
    renderNodes();
    updateLinkTypeButtons();
  }

  function bindModeControls() {
    if (el.modeMove) {
      el.modeMove.addEventListener("click", () => setMode("move"));
    }
    if (el.modeSelect) {
      el.modeSelect.addEventListener("click", () => setMode("select"));
    }
    if (el.modeConnect) {
      el.modeConnect.addEventListener("click", () => setMode("connect"));
    }
    if (el.linkType) {
      el.linkType.addEventListener("change", () => {
        setLinkType(el.linkType.value || "ethernet");
      });
    }
    el.cableButtons.forEach((button) => {
      button.addEventListener("click", () => {
        setLinkType(button.dataset.linkType || "ethernet");
      });
    });
    if (el.snap) {
      el.snap.addEventListener("click", () => {
        state.snapToGrid = !state.snapToGrid;
        el.snap.textContent = `Snap: ${state.snapToGrid ? "On" : "Off"}`;
      });
    }
    updateLinkTypeButtons();
  }

  function alignSelected(axis) {
    const nodes = Array.from(state.selectedNodeIds).map(getNode).filter(Boolean);
    if (nodes.length < 2) return;
    if (axis === "x") {
      const minX = Math.min(...nodes.map((n) => n.x));
      nodes.forEach((node) => {
        node.x = state.snapToGrid ? snapValue(minX) : minX;
      });
    } else {
      const minY = Math.min(...nodes.map((n) => n.y));
      nodes.forEach((node) => {
        node.y = state.snapToGrid ? snapValue(minY) : minY;
      });
    }
    renderNodes();
    renderConnections();
    schedulePersistCurrentTopology(true);
  }

  function distributeSelected(axis) {
    const nodes = Array.from(state.selectedNodeIds).map(getNode).filter(Boolean);
    if (nodes.length < 3) return;
    const sorted = nodes.sort((a, b) => (axis === "x" ? a.x - b.x : a.y - b.y));
    const min = axis === "x" ? sorted[0].x : sorted[0].y;
    const max = axis === "x" ? sorted[sorted.length - 1].x : sorted[sorted.length - 1].y;
    const step = (max - min) / (sorted.length - 1);
    sorted.forEach((node, index) => {
      const value = min + step * index;
      if (axis === "x") {
        node.x = state.snapToGrid ? snapValue(value) : value;
      } else {
        node.y = state.snapToGrid ? snapValue(value) : value;
      }
    });
    renderNodes();
    renderConnections();
    schedulePersistCurrentTopology(true);
  }

  function bindLayoutControls() {
    if (el.alignLeft) {
      el.alignLeft.addEventListener("click", () => alignSelected("x"));
    }
    if (el.alignTop) {
      el.alignTop.addEventListener("click", () => alignSelected("y"));
    }
    if (el.distributeH) {
      el.distributeH.addEventListener("click", () => distributeSelected("x"));
    }
    if (el.distributeV) {
      el.distributeV.addEventListener("click", () => distributeSelected("y"));
    }
  }

  function bindPaletteFilters() {
    el.filterButtons.forEach((button) => {
      button.addEventListener("click", () => {
        state.paletteCategory = button.dataset.category || "all";
        el.filterButtons.forEach((item) => item.classList.toggle("is-active", item === button));
        applyPaletteFilters();
      });
    });

    if (el.deviceSearch) {
      el.deviceSearch.addEventListener("input", () => {
        state.searchTerm = el.deviceSearch.value || "";
        applyPaletteFilters();
      });
    }

    applyPaletteFilters();
  }

  function bindDockEnhancements() {
    el.quickPickButtons.forEach((button) => {
      button.addEventListener("click", () => {
        addDeviceFromPalette(button.dataset.quickDevice, button.dataset.quickModel || "");
      });
    });

    if (el.recentDevices) {
      el.recentDevices.addEventListener("click", (event) => {
        const button = event.target.closest("[data-recent-device]");
        if (!button) return;
        addDeviceFromPalette(button.dataset.recentDevice, button.dataset.recentModel || "");
      });
    }

    el.groupToggleButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const group = button.closest(".topology-palette-group");
        if (!group) return;
        group.classList.toggle("is-collapsed");
        button.textContent = group.classList.contains("is-collapsed") ? "Show" : "Hide";
      });
    });

    renderRecentDevices();
    updateDockOverview();
  }

  function serializeTopology() {
    return {
      nodes: state.nodes,
      connections: state.connections,
      savedAt: new Date().toISOString()
    };
  }

  function persistCurrentTopology() {
    try {
      localStorage.setItem(STORAGE_KEYS.current, JSON.stringify(serializeTopology()));
    } catch (_error) {
      // ignore
    }
  }

  function loadTopologyData(data) {
    if (!data || !Array.isArray(data.nodes) || !Array.isArray(data.connections)) {
      setHint("Invalid topology data.");
      return;
    }

    state.nodes = data.nodes.map((node) => {
      const ports = Array.isArray(node.ports) && node.ports.length
        ? node.ports
        : defaultPorts(node.type);
      return {
        ...node,
        ports,
        config: {
          hostname: node.config?.hostname || node.label || node.model || node.type,
          mgmtIp: node.config?.mgmtIp || "",
          role: node.config?.role || "",
          notes: node.config?.notes || "",
          routes: node.config?.routes || "",
          vlans: node.config?.vlans || "",
          ospfNetworks: Array.isArray(node.config?.ospfNetworks) ? [...node.config.ospfNetworks] : []
        }
      };
    });
    state.connections = data.connections;
    state.selectedNodeIds.clear();
    state.selectedNodeId = null;
    state.connectFrom = null;
    renderNodes();
    renderConnections();
    updateInspector();
    schedulePersistCurrentTopology(true);
  }

  function savedTopologies() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.saved);
      if (!raw) return {};
      return JSON.parse(raw);
    } catch (_error) {
      return {};
    }
  }

  function writeSavedTopologies(all) {
    localStorage.setItem(STORAGE_KEYS.saved, JSON.stringify(all));
  }

  function refreshSavedList() {
    if (!el.savedList) return;
    const all = savedTopologies();
    const names = Object.keys(all).sort((a, b) => a.localeCompare(b));
    el.savedList.innerHTML = names.map((name) => `<option value="${name}">${name}</option>`).join("");
  }

  function bindSaveLoad() {
    refreshSavedList();

    if (el.saveBtn) {
      el.saveBtn.addEventListener("click", () => {
        const name = (el.saveName?.value || "").trim() || `Topology ${new Date().toLocaleString()}`;
        const all = savedTopologies();
        all[name] = serializeTopology();
        writeSavedTopologies(all);
        refreshSavedList();
        if (el.savedList) el.savedList.value = name;
        setHint(`Saved topology as "${name}".`);
      });
    }

    if (el.loadBtn) {
      el.loadBtn.addEventListener("click", () => {
        const name = el.savedList?.value;
        if (!name) return;
        const all = savedTopologies();
        if (!all[name]) return;
        loadTopologyData(all[name]);
        setHint(`Loaded "${name}".`);
      });
    }

    if (el.exportBtn) {
      el.exportBtn.addEventListener("click", () => {
        const data = serializeTopology();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `topology-${Date.now()}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
      });
    }

    if (el.importInput) {
      el.importInput.addEventListener("change", async () => {
        const file = el.importInput.files?.[0];
        if (!file) return;
        try {
          const text = await file.text();
          const data = JSON.parse(text);
          loadTopologyData(data);
          setHint(`Imported ${file.name}.`);
        } catch (_error) {
          setHint("Failed to import topology JSON.");
        } finally {
          el.importInput.value = "";
        }
      });
    }
  }

  function populateTemplates() {
    if (!el.template) return;
    el.template.innerHTML = templates.map((t) => `<option value="${t.id}">${t.name}</option>`).join("");
  }

  function bindTemplates() {
    populateTemplates();
    if (!el.loadTemplate) return;
    el.loadTemplate.addEventListener("click", () => {
      const id = el.template?.value;
      const template = templates.find((t) => t.id === id);
      if (!template) return;
      state.nodes = [];
      state.connections = [];
      template.build();
      state.selectedNodeIds.clear();
      renderNodes();
      renderConnections();
      updateInspector();
      schedulePersistCurrentTopology(true);
      setHint(`Template "${template.name}" loaded.`);
    });
  }

  function updateInspector() {
    if (!el.inspectorPanel || !el.inspectorEmpty) return;
    const node = state.inspectorNodeId ? getNode(state.inspectorNodeId) : null;
    if (!node) {
      if (el.inspectorTitle) el.inspectorTitle.textContent = "No device selected";
      if (el.inspectorMeta) el.inspectorMeta.textContent = "Select a device on the canvas to edit details and interfaces.";
      el.inspectorEmpty.style.display = "block";
      el.inspectorPanel.style.display = "none";
      return;
    }

    if (el.inspectorTitle) el.inspectorTitle.textContent = node.label || node.model || node.type;
    if (el.inspectorMeta) el.inspectorMeta.textContent = `${node.type}${node.model ? ` - ${node.model}` : ""}`;
    el.inspectorEmpty.style.display = "none";
    el.inspectorPanel.style.display = "grid";
    if (el.inspectorLabel) el.inspectorLabel.value = node.label || "";
    if (el.inspectorHostname) el.inspectorHostname.value = node.config.hostname || "";
    if (el.inspectorMgmtIp) el.inspectorMgmtIp.value = node.config.mgmtIp || "";
    if (el.inspectorRole) el.inspectorRole.value = node.config.role || "";
    if (el.inspectorNotes) el.inspectorNotes.value = node.config.notes || "";
    if (el.inspectorRoutes) el.inspectorRoutes.value = node.config.routes || "";
    if (el.inspectorVlans) el.inspectorVlans.value = node.config.vlans || "";

    renderInspectorPorts(node);
  }

  function renderInspectorPorts(node) {
    if (!el.inspectorPorts) return;
    const rows = node.ports
      .map((p) => {
        const status = p.up ? "up" : "down";
        return `
          <tr data-port="${p.id}">
            <td>${p.label}</td>
            <td>${p.media}</td>
            <td>
              <select data-field="up">
                <option value="up" ${status === "up" ? "selected" : ""}>up</option>
                <option value="down" ${status === "down" ? "selected" : ""}>down</option>
              </select>
            </td>
            <td><input data-field="ip" value="${p.ip || ""}" placeholder="IP"></td>
            <td><input data-field="vlan" value="${p.vlan || ""}" placeholder="VLAN"></td>
          </tr>
        `;
      })
      .join("");

    el.inspectorPorts.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Port</th>
            <th>Media</th>
            <th>Status</th>
            <th>IP</th>
            <th>VLAN</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  function bindInspector() {
    if (el.inspectorLabel) {
      el.inspectorLabel.addEventListener("input", () => {
        const node = getNode(state.inspectorNodeId);
        if (!node) return;
        node.label = el.inspectorLabel.value.trim() || node.label;
        renderNodes();
        schedulePersistCurrentTopology();
      });
    }

    if (el.inspectorHostname) {
      el.inspectorHostname.addEventListener("input", () => {
        const node = getNode(state.inspectorNodeId);
        if (!node) return;
        node.config.hostname = el.inspectorHostname.value.trim();
        schedulePersistCurrentTopology();
      });
    }

    if (el.inspectorMgmtIp) {
      el.inspectorMgmtIp.addEventListener("input", () => {
        const node = getNode(state.inspectorNodeId);
        if (!node) return;
        node.config.mgmtIp = el.inspectorMgmtIp.value.trim();
        schedulePersistCurrentTopology();
      });
    }

    if (el.inspectorRole) {
      el.inspectorRole.addEventListener("input", () => {
        const node = getNode(state.inspectorNodeId);
        if (!node) return;
        node.config.role = el.inspectorRole.value.trim();
        schedulePersistCurrentTopology();
      });
    }

    if (el.inspectorNotes) {
      el.inspectorNotes.addEventListener("input", () => {
        const node = getNode(state.inspectorNodeId);
        if (!node) return;
        node.config.notes = el.inspectorNotes.value.trim();
        schedulePersistCurrentTopology();
      });
    }

    if (el.inspectorRoutes) {
      el.inspectorRoutes.addEventListener("input", () => {
        const node = getNode(state.inspectorNodeId);
        if (!node) return;
        node.config.routes = el.inspectorRoutes.value.trim();
        schedulePersistCurrentTopology();
      });
    }

    if (el.inspectorVlans) {
      el.inspectorVlans.addEventListener("input", () => {
        const node = getNode(state.inspectorNodeId);
        if (!node) return;
        node.config.vlans = el.inspectorVlans.value.trim();
        schedulePersistCurrentTopology();
      });
    }

    if (el.inspectorPorts) {
      el.inspectorPorts.addEventListener("input", (event) => {
        const row = event.target.closest("tr[data-port]");
        if (!row) return;
        const node = getNode(state.inspectorNodeId);
        if (!node) return;
        const portItem = getPort(node, row.dataset.port);
        if (!portItem) return;

        const field = event.target.dataset.field;
        if (field === "ip") {
          portItem.ip = event.target.value.trim();
        }
        if (field === "vlan") {
          portItem.vlan = event.target.value.trim();
        }
        if (field === "up") {
          portItem.up = event.target.value === "up";
        }
        renderNodes();
        schedulePersistCurrentTopology();
      });

      el.inspectorPorts.addEventListener("change", (event) => {
        const row = event.target.closest("tr[data-port]");
        if (!row) return;
        const node = getNode(state.inspectorNodeId);
        if (!node) return;
        const portItem = getPort(node, row.dataset.port);
        if (!portItem) return;
        const field = event.target.dataset.field;
        if (field === "up") {
          portItem.up = event.target.value === "up";
          renderNodes();
          schedulePersistCurrentTopology();
        }
      });
    }

    if (el.inspectorOpenCli) {
      el.inspectorOpenCli.addEventListener("click", () => {
        const node = getNode(state.inspectorNodeId);
        if (!node) return;
        openCliForNode(node);
      });
    }

    if (el.inspectorExport) {
      el.inspectorExport.addEventListener("click", async () => {
        const node = getNode(state.inspectorNodeId);
        if (!node) return;
        const config = buildRunningConfig(node);
        try {
          await navigator.clipboard.writeText(config);
          setHint("Config copied to clipboard.");
        } catch (_error) {
          // ignore
        }
        const blob = new Blob([config], { type: "text/plain" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `${node.label || node.type}-config.txt`;
        document.body.appendChild(link);
        link.click();
        link.remove();
      });
    }

    if (el.inspectorDelete) {
      el.inspectorDelete.addEventListener("click", () => {
        const node = getNode(state.inspectorNodeId);
        if (!node) return;
        const activeCliDeviceId = window.RouteForgeCLI?.getState?.().context?.deviceId || null;
        state.connections = state.connections.filter((conn) => conn.from !== node.id && conn.to !== node.id);
        state.nodes = state.nodes.filter((item) => item.id !== node.id);
        state.selectedNodeIds.delete(node.id);
        state.selectedNodeId = null;
        state.inspectorNodeId = null;
        renderNodes();
        renderConnections();
        updateInspector();
        schedulePersistCurrentTopology(true);
        if (activeCliDeviceId === node.id) {
          closeCliModal();
        }
        setHint("Device deleted.");
      });
    }
  }

  function buildRunningConfig(node) {
    const lines = [];
    lines.push(`hostname ${node.config.hostname || node.label || node.type}`);
    if (node.type === "Switch") {
      if (node.config.vlans) {
        lines.push("!");
        lines.push(node.config.vlans);
      }
    }
    node.ports.forEach((p) => {
      const iface = interfaceNameForPort(p.id);
      if (!iface) return;
      lines.push("!");
      lines.push(`interface ${iface}`);
      if (p.ip) {
        const ipParts = p.ip.split("/");
        if (ipParts.length === 2) {
          lines.push(` ip address ${ipParts[0]} ${prefixToMask(ipParts[1])}`);
        } else {
          lines.push(` ip address ${p.ip}`);
        }
      }
      if (node.type === "Switch" && p.vlan) {
        lines.push(" switchport mode access");
        lines.push(` switchport access vlan ${p.vlan}`);
      }
      lines.push(p.up ? " no shutdown" : " shutdown");
    });

    if (node.config.routes) {
      lines.push("!");
      lines.push(node.config.routes);
    }

    if (Array.isArray(node.config.ospfNetworks) && node.config.ospfNetworks.length) {
      lines.push("!");
      lines.push("router ospf 1");
      node.config.ospfNetworks.forEach((statement) => {
        lines.push(` network ${statement}`);
      });
    }

    return lines.join("\n");
  }

  function prefixToMask(prefix) {
    const value = Number(prefix);
    if (!Number.isFinite(value)) return prefix;
    if (value <= 0) return "0.0.0.0";
    const mask = (~((1 << (32 - value)) - 1)) >>> 0;
    return [
      (mask >>> 24) & 255,
      (mask >>> 16) & 255,
      (mask >>> 8) & 255,
      mask & 255
    ].join(".");
  }

  function interfaceNameForPort(portId) {
    if (portId.startsWith("g")) return `GigabitEthernet${portId.slice(1)}`;
    if (portId.startsWith("fa")) return `FastEthernet${portId.slice(2)}`;
    if (portId.startsWith("s")) return `Serial${portId.slice(1)}`;
    return null;
  }

  function openCliForNode(node) {
    const context = buildCliContext(node);
    persistCliContext(context);

    if (!openCliModal(node, context)) {
      window.open("cli-simulator.html", "_blank");
      return;
    }

    setHint(`Opened CLI for ${node.label}.`);
  }

  function mergeCliContexts() {
    let contexts = {};
    try {
      contexts = JSON.parse(localStorage.getItem(STORAGE_KEYS.cliContexts) || "{}");
    } catch (_error) {
      contexts = {};
    }

    let changed = false;
    state.nodes.forEach((node) => {
      const context = contexts[node.id];
      if (!context || !context.interfaces) return;
      Object.entries(context.interfaces).forEach(([iface, data]) => {
        const portItem = getPort(node, iface);
        if (!portItem) return;
        portItem.ip = data.ip && data.ip !== "unassigned" ? data.ip : "";
        portItem.mask = data.mask || "";
        portItem.up = Boolean(data.up);
        changed = true;
      });
      if (context.hostname) {
        if (node.config.hostname !== context.hostname) {
          node.config.hostname = context.hostname;
          changed = true;
        }
      }
      if (Array.isArray(context.ospfNetworks)) {
        const nextOspf = [...context.ospfNetworks];
        const currentOspf = Array.isArray(node.config.ospfNetworks) ? node.config.ospfNetworks : [];
        if (JSON.stringify(currentOspf) !== JSON.stringify(nextOspf)) {
          node.config.ospfNetworks = nextOspf;
          changed = true;
        }
      }
    });

    if (changed) {
      renderNodes();
      renderConnections();
      updateInspector();
      schedulePersistCurrentTopology(true);
    }
  }

  function bindKeyboardShortcuts() {
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && isCliModalOpen()) {
        closeCliModal();
        return;
      }

      if (isCliModalOpen()) {
        return;
      }

      const active = document.activeElement;
      const isTyping = active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA");
      if (isTyping) return;

      if (event.key === "Escape" && state.connectFrom) {
        state.connectFrom = null;
        renderNodes();
        setHint("Pending connection cleared.");
        return;
      }

      if (event.key.toLowerCase() === "c") {
        setMode("connect");
      }
      if (event.key.toLowerCase() === "m") {
        setMode("move");
      }
      if (event.key.toLowerCase() === "s") {
        if (el.snap) el.snap.click();
      }
      if ((event.key === "Delete" || event.key === "Backspace") && state.selectedNodeIds.size) {
        state.selectedNodeIds.forEach((id) => {
          state.connections = state.connections.filter((conn) => conn.from !== id && conn.to !== id);
          state.nodes = state.nodes.filter((node) => node.id !== id);
        });
        state.selectedNodeIds.clear();
        state.selectedNodeId = null;
        state.inspectorNodeId = null;
        state.connectFrom = null;
        renderNodes();
        renderConnections();
        updateInspector();
        schedulePersistCurrentTopology(true);
      }
    });
  }

  function bindCanvasSelectionClear() {
    el.canvas.addEventListener("click", (event) => {
      if (
        event.target === el.canvas ||
        event.target === el.svg ||
        event.target.classList.contains("topology-grid-overlay") ||
        event.target.classList.contains("topology-empty-state")
      ) {
        if (state.connectFrom) {
          state.connectFrom = null;
          renderNodes();
          setHint("Pending connection cleared.");
        }
        clearSelection();
      }
    });
  }

  function bindCliModal() {
    if (!el.cliBackdrop) return;

    if (el.cliClose) {
      el.cliClose.addEventListener("click", () => {
        closeCliModal();
      });
    }

    el.cliBackdrop.addEventListener("click", (event) => {
      if (event.target === el.cliBackdrop) {
        closeCliModal();
      }
    });
  }

  function loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.current);
      if (!raw) return;
      const data = JSON.parse(raw);
      loadTopologyData(data);
    } catch (_error) {
      // ignore
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    bindModeControls();
    bindPaletteDnD();
    bindPaletteFilters();
    bindDockEnhancements();
    bindMove();
    bindClear();
    bindLayoutControls();
    bindSaveLoad();
    bindTemplates();
    bindInspector();
    bindKeyboardShortcuts();
    bindCanvasSelectionClear();
    bindCliModal();
    loadFromStorage();
    mergeCliContexts();
    setLinkType(el.linkType?.value || "ethernet");
    setMode("move");
    updateWorkspaceStats();
    window.addEventListener("focus", mergeCliContexts);
    window.addEventListener("storage", (event) => {
      if (event.key === STORAGE_KEYS.cliContexts) {
        mergeCliContexts();
      }
    });
  });
})();

