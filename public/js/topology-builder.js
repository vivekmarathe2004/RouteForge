
(function () {
  if (document.body.dataset.page !== "topology") return;

  const icons = {
    Router: "[R]",
    Switch: "[SW]",
    PC: "[PC]",
    Server: "[SV]",
    Firewall: "[FW]",
    AccessPoint: "[AP]",
    Cloud: "[CL]",
    Laptop: "[LT]",
    Phone: "[PH]",
    Printer: "[PR]"
  };

  const STORAGE_KEYS = {
    saved: "routeforge.topology.saved",
    current: "routeforge.topology.current",
    cliContexts: "routeforge.cli.contexts",
    cliContext: "routeforge.cli.context"
  };

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
    inspectorNodeId: null
  };

  const el = {
    canvas: document.getElementById("topology-canvas"),
    svg: document.getElementById("topology-svg"),
    clear: document.getElementById("topology-clear"),
    hint: document.getElementById("topology-hint"),
    modeMove: document.getElementById("topology-mode-move"),
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
    return { x: node.x + 55, y: node.y + 30 };
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
    if (cableType === "wireless" && portItem && portItem.media === "wireless") {
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
    if (!nodeA || !nodeB) return false;
    const portA = getPort(nodeA, portAId);
    const portB = getPort(nodeB, portBId);
    if (!portCompatible(portA, portB, cableType)) {
      setHint("Cable type not compatible with selected ports.");
      return false;
    }
    if (!deviceAllowsCable(nodeA, nodeB, cableType)) {
      setHint("Cable type not supported between these device types.");
      return false;
    }
    if (isPortBlocked(nodeA.id, portAId, cableType) || isPortBlocked(nodeB.id, portBId, cableType)) {
      setHint("One of the selected ports is already in use.");
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

  function renderNodes() {
    Array.from(el.canvas.querySelectorAll(".node")).forEach((node) => node.remove());
    state.nodes.forEach((node) => {
      const div = document.createElement("div");
      div.className = "node";
      if (state.selectedNodeIds.has(node.id)) {
        div.classList.add("is-selected");
      }
      div.style.left = `${node.x}px`;
      div.style.top = `${node.y}px`;
      div.dataset.nodeId = node.id;

      const portsHtml = node.ports
        .map((p) => {
          const classes = ["port-chip"];
          if (isPortUsed(node.id, p.id)) classes.push("is-used");
          if (p.up) classes.push("is-up");
          if (!p.up && (p.ip || p.vlan)) classes.push("is-down");
          if (state.connectFrom && state.connectFrom.nodeId === node.id && state.connectFrom.portId === p.id) {
            classes.push("is-selected");
          }
          return `<button class="${classes.join(" ")}" data-port="${p.id}" type="button">${p.label}</button>`;
        })
        .join("");

      div.innerHTML = `
        <div class="node-icon">${icons[node.type] || "[?]"}</div>
        <div>${node.label}</div>
        <div class="node-ports">${portsHtml}</div>
      `;

      div.addEventListener("mousedown", (event) => {
        if (state.mode !== "move") return;
        state.movingNodeId = node.id;
        state.dragOffset = { x: event.offsetX, y: event.offsetY };
      });

      div.addEventListener("click", (event) => {
        const portButton = event.target.closest("[data-port]");
        if (portButton) {
          event.stopPropagation();
          handlePortClick(node.id, portButton.dataset.port);
          return;
        }
        handleNodeClick(node.id, event);
      });

      el.canvas.appendChild(div);
    });
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
      label.textContent = `${conn.fromPort} ↔ ${conn.toPort}`;
      el.svg.appendChild(label);
    });
  }

  function handlePortClick(nodeId, portId) {
    if (state.mode !== "connect") {
      setHint("Switch to Connect mode to use cable connections.");
      return;
    }

    if (isPortBlocked(nodeId, portId, state.linkType)) {
      setHint("Selected port is already used. Choose another port.");
      return;
    }

    if (!state.connectFrom) {
      state.connectFrom = { nodeId, portId };
      renderNodes();
      setHint("Select a second device port to create a connection.");
      return;
    }

    if (state.connectFrom.nodeId === nodeId && state.connectFrom.portId === portId) {
      state.connectFrom = null;
      renderNodes();
      setHint("Cable selection cleared.");
      return;
    }

    const nodeA = getNode(state.connectFrom.nodeId);
    const nodeB = getNode(nodeId);
    const created = createConnection(nodeA, state.connectFrom.portId, nodeB, portId, state.linkType);
    if (created) {
      renderConnections();
      setHint(`${state.linkType.toUpperCase()} link created.`);
    }
    state.connectFrom = null;
    renderNodes();
    persistCurrentTopology();
  }

  function handleNodeClick(nodeId, event) {
    if (state.mode === "connect") {
      setHint("Select a port to connect. Click port chips on the device.");
      return;
    }

    if (event.shiftKey) {
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
  }

  function bindPaletteDnD() {
    Array.from(document.querySelectorAll(".device-item")).forEach((item) => {
      item.addEventListener("dragstart", (event) => {
        event.dataTransfer.setData("text/plain", JSON.stringify({
          device: item.dataset.device,
          model: item.dataset.model || ""
        }));
      });
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
      const x = clamp(snapValue(event.clientX - rect.left - 40), 0, rect.width - 110);
      const y = clamp(snapValue(event.clientY - rect.top - 30), 0, rect.height - 90);
      createNode(type, model, x, y, { label: `${model || type}` });
      renderNodes();
      renderConnections();
      persistCurrentTopology();
      setHint(`${model || type} added. ${state.mode === "connect" ? "Click ports to connect." : "Drag to position."}`);
    });
  }

  function bindMove() {
    document.addEventListener("mousemove", (event) => {
      if (!state.movingNodeId) return;
      const node = getNode(state.movingNodeId);
      if (!node) return;

      const rect = canvasRect();
      node.x = clamp(snapValue(event.clientX - rect.left - state.dragOffset.x), 0, rect.width - 110);
      node.y = clamp(snapValue(event.clientY - rect.top - state.dragOffset.y), 0, rect.height - 90);

      renderNodes();
      renderConnections();
    });

    document.addEventListener("mouseup", () => {
      if (state.movingNodeId) {
        persistCurrentTopology();
      }
      state.movingNodeId = null;
    });
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
      persistCurrentTopology();
      setHint("Canvas cleared.");
    });
  }

  function setMode(mode) {
    state.mode = mode;
    state.connectFrom = null;
    if (mode === "connect") {
      setHint("Connect mode: pick a cable type and click two device ports.");
    } else {
      setHint("Move mode: drag devices. Use Shift+Click to multi-select.");
    }
    if (el.modeMove) el.modeMove.classList.toggle("btn-primary", mode === "move");
    if (el.modeConnect) el.modeConnect.classList.toggle("btn-primary", mode === "connect");
    renderNodes();
  }

  function bindModeControls() {
    if (el.modeMove) {
      el.modeMove.addEventListener("click", () => setMode("move"));
    }
    if (el.modeConnect) {
      el.modeConnect.addEventListener("click", () => setMode("connect"));
    }
    if (el.linkType) {
      el.linkType.addEventListener("change", () => {
        state.linkType = el.linkType.value || "ethernet";
      });
    }
    if (el.snap) {
      el.snap.addEventListener("click", () => {
        state.snapToGrid = !state.snapToGrid;
        el.snap.textContent = `Snap: ${state.snapToGrid ? "On" : "Off"}`;
      });
    }
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
    persistCurrentTopology();
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
    persistCurrentTopology();
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
          vlans: node.config?.vlans || ""
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
    persistCurrentTopology();
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
      persistCurrentTopology();
      setHint(`Template "${template.name}" loaded.`);
    });
  }

  function updateInspector() {
    if (!el.inspectorPanel || !el.inspectorEmpty) return;
    const node = state.inspectorNodeId ? getNode(state.inspectorNodeId) : null;
    if (!node) {
      el.inspectorEmpty.style.display = "block";
      el.inspectorPanel.style.display = "none";
      return;
    }

    el.inspectorEmpty.style.display = "none";
    el.inspectorPanel.style.display = "block";
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
        persistCurrentTopology();
      });
    }

    if (el.inspectorHostname) {
      el.inspectorHostname.addEventListener("input", () => {
        const node = getNode(state.inspectorNodeId);
        if (!node) return;
        node.config.hostname = el.inspectorHostname.value.trim();
        persistCurrentTopology();
      });
    }

    if (el.inspectorMgmtIp) {
      el.inspectorMgmtIp.addEventListener("input", () => {
        const node = getNode(state.inspectorNodeId);
        if (!node) return;
        node.config.mgmtIp = el.inspectorMgmtIp.value.trim();
        persistCurrentTopology();
      });
    }

    if (el.inspectorRole) {
      el.inspectorRole.addEventListener("input", () => {
        const node = getNode(state.inspectorNodeId);
        if (!node) return;
        node.config.role = el.inspectorRole.value.trim();
        persistCurrentTopology();
      });
    }

    if (el.inspectorNotes) {
      el.inspectorNotes.addEventListener("input", () => {
        const node = getNode(state.inspectorNodeId);
        if (!node) return;
        node.config.notes = el.inspectorNotes.value.trim();
        persistCurrentTopology();
      });
    }

    if (el.inspectorRoutes) {
      el.inspectorRoutes.addEventListener("input", () => {
        const node = getNode(state.inspectorNodeId);
        if (!node) return;
        node.config.routes = el.inspectorRoutes.value.trim();
        persistCurrentTopology();
      });
    }

    if (el.inspectorVlans) {
      el.inspectorVlans.addEventListener("input", () => {
        const node = getNode(state.inspectorNodeId);
        if (!node) return;
        node.config.vlans = el.inspectorVlans.value.trim();
        persistCurrentTopology();
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
        persistCurrentTopology();
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
          persistCurrentTopology();
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
        state.connections = state.connections.filter((conn) => conn.from !== node.id && conn.to !== node.id);
        state.nodes = state.nodes.filter((item) => item.id !== node.id);
        state.selectedNodeIds.delete(node.id);
        state.selectedNodeId = null;
        state.inspectorNodeId = null;
        renderNodes();
        renderConnections();
        updateInspector();
        persistCurrentTopology();
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

    const context = {
      deviceId: node.id,
      label: node.label,
      hostname: node.config.hostname || node.label,
      type: node.type,
      interfaces
    };

    try {
      localStorage.setItem(STORAGE_KEYS.cliContext, JSON.stringify(context));
      const all = JSON.parse(localStorage.getItem(STORAGE_KEYS.cliContexts) || "{}");
      all[node.id] = context;
      localStorage.setItem(STORAGE_KEYS.cliContexts, JSON.stringify(all));
    } catch (_error) {
      // ignore
    }

    window.open("cli-simulator.html", "_blank");
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
        node.config.hostname = context.hostname;
      }
    });

    if (changed) {
      renderNodes();
      renderConnections();
      updateInspector();
      persistCurrentTopology();
    }
  }

  function bindKeyboardShortcuts() {
    document.addEventListener("keydown", (event) => {
      const active = document.activeElement;
      const isTyping = active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA");
      if (isTyping) return;

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
        renderNodes();
        renderConnections();
        updateInspector();
        persistCurrentTopology();
      }
    });
  }

  function bindCanvasSelectionClear() {
    el.canvas.addEventListener("click", (event) => {
      if (event.target === el.canvas || event.target === el.svg) {
        clearSelection();
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
    bindMove();
    bindClear();
    bindLayoutControls();
    bindSaveLoad();
    bindTemplates();
    bindInspector();
    bindKeyboardShortcuts();
    bindCanvasSelectionClear();
    loadFromStorage();
    mergeCliContexts();
    setMode("move");
    window.addEventListener("focus", mergeCliContexts);
    window.addEventListener("storage", (event) => {
      if (event.key === STORAGE_KEYS.cliContexts) {
        mergeCliContexts();
      }
    });
  });
})();
