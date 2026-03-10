const fs = require("fs");
const path = require("path");

const dataDir = path.join(__dirname, "..", "data");
const labsPath = path.join(dataDir, "labs.json");
const quizPath = path.join(dataDir, "quiz-bank.json");

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw.replace(/^\uFEFF/, ""));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function pad(value, length) {
  return String(value).padStart(length, "0");
}

function ipToInt(ip) {
  return ip.split(".").reduce((acc, octet) => ((acc << 8) >>> 0) + Number(octet), 0) >>> 0;
}

function intToIp(value) {
  return [
    (value >>> 24) & 255,
    (value >>> 16) & 255,
    (value >>> 8) & 255,
    value & 255
  ].join(".");
}

function maskFromPrefix(prefix) {
  if (prefix === 0) return 0;
  return (~((1 << (32 - prefix)) - 1)) >>> 0;
}

function wildcardFromMask(maskInt) {
  return (~maskInt) >>> 0;
}

function usableHosts(prefix) {
  return Math.max(0, Math.pow(2, 32 - prefix) - 2);
}

function smallestPrefixForHosts(hosts) {
  const needed = hosts + 2;
  const bits = Math.ceil(Math.log2(needed));
  return 32 - bits;
}

function makeOptions(correct, wrongs, rotation) {
  const options = [correct, ...wrongs];
  const shift = rotation % options.length;
  const rotated = options.slice(shift).concat(options.slice(0, shift));
  return { options: rotated, answerIndex: rotated.indexOf(correct) };
}

const departments = [
  "Sales",
  "Engineering",
  "HR",
  "Finance",
  "Operations",
  "Marketing",
  "Support",
  "DevOps",
  "Security",
  "R&D"
];

const labCountPerTopic = 250;

function uniqTags(tags) {
  return Array.from(new Set(tags.filter(Boolean).map((tag) => String(tag).trim()))).filter(Boolean);
}

function inferCategoryFromTags(tags) {
  const normalized = tags.map((tag) => tag.toLowerCase());
  if (normalized.some((tag) => ["vlan", "trunking", "stp", "etherchannel", "port security"].includes(tag))) {
    return "Switching";
  }
  if (normalized.some((tag) => ["ospf", "static routing", "routing", "inter-vlan", "bgp"].includes(tag))) {
    return "Routing";
  }
  if (normalized.some((tag) => ["acl", "security"].includes(tag))) {
    return "Security";
  }
  if (normalized.some((tag) => ["dhcp", "nat", "services"].includes(tag))) {
    return "Services";
  }
  if (normalized.some((tag) => ["hsrp", "high availability"].includes(tag))) {
    return "High Availability";
  }
  return "General";
}

function enrichBaseLab(lab) {
  if (lab.tags && lab.category) return lab;

  const text = [
    lab.title,
    lab.scenario,
    lab.topology,
    (lab.requiredCommands || []).join(" ")
  ]
    .join(" ")
    .toLowerCase();

  const tags = [];
  if (text.includes("vlan")) tags.push("VLAN");
  if (text.includes("trunk")) tags.push("Trunking");
  if (text.includes("inter-vlan") || text.includes("router-on-a-stick")) tags.push("Inter-VLAN");
  if (text.includes("ospf")) tags.push("OSPF");
  if (text.includes("acl") || text.includes("access-list")) tags.push("ACL");
  if (text.includes("nat")) tags.push("NAT");
  if (text.includes("dhcp")) tags.push("DHCP");
  if (text.includes("stp") || text.includes("spanning-tree")) tags.push("STP");
  if (text.includes("etherchannel") || text.includes("port-channel")) tags.push("EtherChannel");
  if (text.includes("port security")) tags.push("Port Security");
  if (text.includes("hsrp") || text.includes("standby")) tags.push("HSRP");
  if (text.includes("routing")) tags.push("Routing");
  if (text.includes("switch")) tags.push("Switching");

  const resolvedTags = uniqTags(tags);
  const category = lab.category || inferCategoryFromTags(resolvedTags);

  return {
    ...lab,
    category,
    tags: lab.tags && lab.tags.length ? lab.tags : resolvedTags
  };
}

const topics = [
  {
    key: "vlan",
    difficulty: "CCNA beginner",
    category: "Switching",
    tags: ["VLAN", "Switching"],
    build: (i) => {
      const vlanA = 10 + ((i * 7) % 300);
      const vlanB = 20 + ((i * 9) % 300);
      const deptA = departments[i % departments.length];
      const deptB = departments[(i + 3) % departments.length];
      return {
        title: `Configure VLAN Access Ports ${vlanA}/${vlanB}`,
        scenario: `Segment ${deptA} into VLAN ${vlanA} and ${deptB} into VLAN ${vlanB}.`,
        topology: `1 switch, 4 PCs. ${deptA} on fa0/1-2, ${deptB} on fa0/3-4.`,
        category: "Switching",
        tags: ["VLAN", "Access Ports", "Switching"],
        requiredCommands: [
          `vlan ${vlanA}`,
          `name ${deptA.toUpperCase().replace(/\s+/g, "_")}`,
          `vlan ${vlanB}`,
          `name ${deptB.toUpperCase().replace(/\s+/g, "_")}`,
          "interface range fa0/1-2",
          "switchport mode access",
          `switchport access vlan ${vlanA}`,
          "interface range fa0/3-4",
          "switchport mode access",
          `switchport access vlan ${vlanB}`
        ],
        steps: [
          "Create both VLANs with clear names.",
          "Assign access ports to the correct VLAN.",
          "Verify with show vlan brief."
        ],
        verification: "show vlan brief shows correct port membership."
      };
    }
  },
  {
    key: "trunk",
    difficulty: "CCNA beginner",
    category: "Switching",
    tags: ["Trunking", "VLAN", "Switching"],
    build: (i) => {
      const vlanA = 10 + ((i * 5) % 300);
      const vlanB = vlanA + 10;
      const vlanC = vlanA + 20;
      return {
        title: `Configure 802.1Q Trunking ${vlanA},${vlanB},${vlanC}`,
        scenario: "Two switches must carry multiple VLANs across an uplink.",
        topology: "SW1 g0/1 <-> SW2 g0/1 trunk link, users in each VLAN on both switches.",
        category: "Switching",
        tags: ["Trunking", "VLAN", "Switching"],
        requiredCommands: [
          "interface g0/1",
          "switchport mode trunk",
          `switchport trunk allowed vlan ${vlanA},${vlanB},${vlanC}`,
          "show interfaces trunk"
        ],
        steps: [
          "Set both uplink interfaces to trunk mode.",
          "Limit the allowed VLANs to required networks.",
          "Verify trunk operational state."
        ],
        verification: "show interfaces trunk confirms allowed VLANs and trunking enabled."
      };
    }
  },
  {
    key: "intervlan",
    difficulty: "CCNA beginner",
    category: "Routing",
    tags: ["Inter-VLAN", "Routing"],
    build: (i) => {
      const vlanA = 10 + ((i * 11) % 300);
      const vlanB = vlanA + 10;
      const subnetA = 10 + ((i * 3) % 200);
      const subnetB = 10 + ((i * 5) % 200);
      return {
        title: `Inter-VLAN Routing for VLAN ${vlanA}/${vlanB}`,
        scenario: "Enable routing between two VLANs using a router-on-a-stick.",
        topology: "R1 g0/0 <-> SW1 trunk; VLANs on access ports.",
        category: "Routing",
        tags: ["Inter-VLAN", "VLAN", "Routing"],
        requiredCommands: [
          "interface g0/0",
          "no shutdown",
          `interface g0/0.${vlanA}`,
          `encapsulation dot1q ${vlanA}`,
          `ip address 192.168.${subnetA}.1 255.255.255.0`,
          `interface g0/0.${vlanB}`,
          `encapsulation dot1q ${vlanB}`,
          `ip address 192.168.${subnetB}.1 255.255.255.0`
        ],
        steps: [
          "Create subinterfaces for both VLANs.",
          "Apply encapsulation and IP addressing.",
          "Verify inter-VLAN connectivity."
        ],
        verification: "show ip interface brief and successful ping between VLANs."
      };
    }
  },
  {
    key: "static",
    difficulty: "CCNA advanced",
    category: "Routing",
    tags: ["Static Routing", "Routing"],
    build: (i) => {
      const lanA = (i * 3) % 200;
      const lanB = (i * 7 + 1) % 200;
      const linkA = (i * 11) % 200;
      const linkB = (i * 13) % 200;
      return {
        title: `Static Routing Between LANs ${lanA} and ${lanB}`,
        scenario: "Connect two LANs through two routers using static routes.",
        topology: `LAN A 192.168.${lanA}.0/24 -> R1 -> R2 -> LAN B 192.168.${lanB}.0/24`,
        category: "Routing",
        tags: ["Static Routing", "Routing"],
        requiredCommands: [
          `ip route 192.168.${lanB}.0 255.255.255.0 10.${linkA}.${linkB}.2`,
          `ip route 192.168.${lanA}.0 255.255.255.0 10.${linkA}.${linkB}.1`
        ],
        steps: [
          "Address all interfaces and bring them up.",
          "Configure static routes on both routers.",
          "Test end-to-end ping and traceroute."
        ],
        verification: "show ip route and successful ping between LAN A and LAN B hosts."
      };
    }
  },
  {
    key: "ospf",
    difficulty: "CCNA advanced",
    category: "Routing",
    tags: ["OSPF", "Routing"],
    build: (i) => {
      const subnet = (i * 9) % 200;
      return {
        title: `Configure Single-Area OSPF ${subnet}`,
        scenario: "Routers in area 0 must exchange routes dynamically.",
        topology: "Three routers in a triangle with loopback networks.",
        category: "Routing",
        tags: ["OSPF", "Routing"],
        requiredCommands: [
          "router ospf 1",
          `network 10.${subnet}.0.0 0.0.255.255 area 0`,
          "passive-interface default",
          "no passive-interface g0/0"
        ],
        steps: [
          "Enable OSPF process on each router.",
          "Advertise links and loopbacks in area 0.",
          "Verify neighbor adjacency and learned routes."
        ],
        verification: "show ip ospf neighbor and show ip route ospf."
      };
    }
  },
  {
    key: "acl",
    difficulty: "CCNA advanced",
    category: "Security",
    tags: ["ACL", "Security"],
    build: (i) => {
      const lan = (i * 7) % 200;
      const server = (i * 11) % 200;
      return {
        title: `Extended ACL for VLAN ${lan}`,
        scenario: `Allow only HTTP from VLAN ${lan} to server 172.16.${server}.10; block all else.`,
        topology: "Users -> Router -> Server network",
        category: "Security",
        tags: ["ACL", "Security"],
        requiredCommands: [
          "ip access-list extended WEB_ONLY",
          `permit tcp 10.${lan}.0.0 0.0.255.255 host 172.16.${server}.10 eq 80`,
          "deny ip any any",
          "interface g0/0",
          "ip access-group WEB_ONLY in"
        ],
        steps: [
          "Build ACL entries in correct order.",
          "Apply ACL inbound on source-facing interface.",
          "Validate with allowed and denied traffic tests."
        ],
        verification: "show access-lists and packet counters increase on matching lines."
      };
    }
  },
  {
    key: "nat",
    difficulty: "CCNA advanced",
    category: "Services",
    tags: ["NAT", "Services"],
    build: (i) => {
      const lan = (i * 11) % 200;
      return {
        title: `Configure PAT for LAN ${lan}`,
        scenario: "Branch users need internet access through one ISP address.",
        topology: `LAN 192.168.${lan}.0/24 -> Router -> ISP`,
        category: "Services",
        tags: ["NAT", "Services"],
        requiredCommands: [
          `access-list 1 permit 192.168.${lan}.0 0.0.0.255`,
          "interface g0/1",
          "ip nat inside",
          "interface g0/0",
          "ip nat outside",
          "ip nat inside source list 1 interface g0/0 overload"
        ],
        steps: [
          "Define inside network ACL.",
          "Mark inside and outside interfaces.",
          "Apply PAT rule and verify translations."
        ],
        verification: "show ip nat translations while hosts generate outbound traffic."
      };
    }
  },
  {
    key: "dhcp",
    difficulty: "CCNA beginner",
    category: "Services",
    tags: ["DHCP", "Services"],
    build: (i) => {
      const lan = (i * 9) % 200;
      const dept = departments[i % departments.length];
      return {
        title: `Configure DHCP for ${dept}`,
        scenario: `Router must assign addresses to ${dept} clients in VLAN ${lan}.`,
        topology: "Router-on-a-stick gateway for VLAN, clients on access switch.",
        category: "Services",
        tags: ["DHCP", "Services", "VLAN"],
        requiredCommands: [
          `ip dhcp excluded-address 192.168.${lan}.1 192.168.${lan}.20`,
          `ip dhcp pool ${dept.toUpperCase().replace(/\s+/g, "_")}`,
          `network 192.168.${lan}.0 255.255.255.0`,
          `default-router 192.168.${lan}.1`,
          "dns-server 8.8.8.8"
        ],
        steps: [
          "Exclude reserved static range.",
          "Create DHCP pool with network and default gateway.",
          "Renew client leases and verify bindings."
        ],
        verification: "show ip dhcp binding and client obtains expected network settings."
      };
    }
  },
  {
    key: "stp",
    difficulty: "CCNA advanced",
    category: "Switching",
    tags: ["STP", "Switching"],
    build: (i) => {
      const vlan = 10 + ((i * 13) % 300);
      return {
        title: `STP Root Bridge for VLAN ${vlan}`,
        scenario: "Elect the desired switch as root for a critical VLAN.",
        topology: "Two switches with redundant links and access layer hosts.",
        category: "Switching",
        tags: ["STP", "Switching", "VLAN"],
        requiredCommands: [
          `spanning-tree vlan ${vlan} root primary`,
          "show spanning-tree vlan"
        ],
        steps: [
          "Lower the bridge priority on the intended root switch.",
          "Verify root role and port states.",
          "Confirm convergence with show spanning-tree."
        ],
        verification: "show spanning-tree vlan shows expected root and port roles."
      };
    }
  },
  {
    key: "etherchannel",
    difficulty: "CCNA advanced",
    category: "Switching",
    tags: ["EtherChannel", "Switching", "Trunking"],
    build: (i) => {
      const vlanA = 10 + ((i * 5) % 300);
      const vlanB = vlanA + 10;
      return {
        title: `LACP EtherChannel for VLAN ${vlanA}/${vlanB}`,
        scenario: "Bundle uplinks using LACP and carry multiple VLANs.",
        topology: "SW1 g0/1-2 <-> SW2 g0/1-2",
        category: "Switching",
        tags: ["EtherChannel", "Trunking", "Switching"],
        requiredCommands: [
          "interface range g0/1-2",
          "channel-group 1 mode active",
          "interface port-channel 1",
          "switchport mode trunk",
          `switchport trunk allowed vlan ${vlanA},${vlanB}`
        ],
        steps: [
          "Create the LACP EtherChannel on both switches.",
          "Configure the Port-Channel as trunk.",
          "Verify with show etherchannel summary."
        ],
        verification: "show etherchannel summary indicates LACP in use and port-channel up."
      };
    }
  },
  {
    key: "port-security",
    difficulty: "CCNA beginner",
    category: "Switching",
    tags: ["Port Security", "Switching", "Security"],
    build: (i) => {
      const interfaceId = (i % 24) + 1;
      const maxMac = (i % 4) + 1;
      const violation = ["protect", "restrict", "shutdown"][i % 3];
      return {
        title: `Port Security on fa0/${interfaceId} (max ${maxMac})`,
        scenario: `Limit the number of MAC addresses learned on an access port and set violation mode to ${violation}.`,
        topology: `1 switch, host on fa0/${interfaceId}`,
        category: "Switching",
        tags: ["Port Security", "Security", "Switching"],
        requiredCommands: [
          `interface fa0/${interfaceId}`,
          "switchport mode access",
          "switchport port-security",
          `switchport port-security maximum ${maxMac}`,
          "switchport port-security mac-address sticky",
          `switchport port-security violation ${violation}`
        ],
        steps: [
          "Enable port security on the access port.",
          "Set maximum MAC addresses and sticky learning.",
          "Verify with show port-security interface."
        ],
        verification: "show port-security interface shows secure-up status."
      };
    }
  },
  {
    key: "hsrp",
    difficulty: "CCNP level",
    category: "High Availability",
    tags: ["HSRP", "High Availability"],
    build: (i) => {
      const lan = (i * 7) % 200;
      return {
        title: `HSRP Gateway for VLAN ${lan}`,
        scenario: "Provide first-hop redundancy using HSRP.",
        topology: `R1 + R2 -> VLAN ${lan} access switch`,
        category: "High Availability",
        tags: ["HSRP", "High Availability", "VLAN"],
        requiredCommands: [
          "interface g0/1",
          `ip address 192.168.${lan}.2 255.255.255.0`,
          `standby 1 ip 192.168.${lan}.254`,
          "standby 1 priority 110",
          "standby 1 preempt"
        ],
        steps: [
          "Configure HSRP on both routers with matching group ID.",
          "Set higher priority for the active router.",
          "Verify with show standby."
        ],
        verification: "show standby reports Active and Standby routers correctly."
      };
    }
  }
];

function generateLabs() {
  const allLabs = readJson(labsPath);
  const baseLabs = allLabs
    .filter((lab) => !String(lab.id).startsWith("lab-gen-"))
    .map((lab) => enrichBaseLab(lab));
  const generated = [];
  const signatures = new Set();

  topics.forEach((topic, topicIndex) => {
    for (let i = 0; i < labCountPerTopic; i += 1) {
      const lab = topic.build(i + topicIndex);
      const signature = `${lab.title}|${lab.scenario}|${lab.topology}`.toLowerCase();
      if (signatures.has(signature)) continue;
      signatures.add(signature);
      generated.push({
        id: `lab-gen-${topic.key}-${pad(i + 1, 4)}`,
        difficulty: topic.difficulty,
        ...lab
      });
    }
  });

  writeJson(labsPath, baseLabs.concat(generated));
  return { base: baseLabs.length, generated: generated.length };
}

function generateQuestions() {
  const allQuestions = readJson(quizPath);
  const baseQuestions = allQuestions.filter((q) => !String(q.id).startsWith("qg-"));
  const generated = [];
  let counter = 1;
  const signatures = new Set();

  function pushQuestion(level, topic, question, correct, wrongs, explanation) {
    const signature = String(question).trim().toLowerCase();
    if (signatures.has(signature)) {
      return false;
    }
    const { options, answerIndex } = makeOptions(correct, wrongs, counter);
    signatures.add(signature);
    generated.push({
      id: `qg-${pad(counter, 6)}`,
      level,
      topic,
      question,
      options,
      answerIndex,
      explanation
    });
    counter += 1;
    return true;
  }

  function createSeries(count, generator) {
    let i = 0;
    let attempts = 0;
    while (i < count && attempts < count * 6) {
      if (generator(i, attempts)) {
        i += 1;
      }
      attempts += 1;
    }
  }

  // CCNA beginner: host counts
  const hostPrefixes = [24, 25, 26, 27, 28, 29, 30];
  createSeries(900, (i) => {
    const prefix = hostPrefixes[i % hostPrefixes.length];
    const subnet = (i * 11) % 200;
    const hosts = usableHosts(prefix);
    const question = `How many usable host addresses are available in 10.${subnet}.0.0/${prefix}?`;
    const wrongs = [
      String(Math.max(0, hosts - 2)),
      String(hosts + 2),
      String(hosts * 2)
    ];
    return pushQuestion(
      "CCNA beginner",
      "Subnetting",
      question,
      String(hosts),
      wrongs,
      "Usable hosts = 2^(32 - prefix) - 2."
    );
  });

  // CCNA beginner: broadcast address
  const broadcastPrefixes = [24, 25, 26, 27, 28, 29];
  createSeries(600, (i) => {
    const prefix = broadcastPrefixes[i % broadcastPrefixes.length];
    const blockSize = Math.pow(2, 32 - prefix);
    const offset = Math.floor(i / broadcastPrefixes.length);
    const base = ipToInt("10.0.0.0");
    const mask = maskFromPrefix(prefix);
    const networkInt = base + (offset * blockSize);
    const broadcastInt = networkInt + blockSize - 1;
    const network = intToIp(networkInt);
    const broadcast = intToIp(broadcastInt);
    const wrongs = [
      intToIp(networkInt + 1),
      intToIp(broadcastInt - 1),
      intToIp(networkInt | (wildcardFromMask(mask) >>> 1))
    ];
    return pushQuestion(
      "CCNA beginner",
      "Subnetting",
      `What is the broadcast address for ${network}/${prefix}?`,
      broadcast,
      wrongs,
      "Broadcast is the highest address in the subnet."
    );
  });

  // CCNA advanced: wildcard masks
  const wildcardPrefixes = [24, 25, 26, 27, 28, 29, 30];
  createSeries(600, (i) => {
    const prefix = wildcardPrefixes[i % wildcardPrefixes.length];
    const mask = maskFromPrefix(prefix);
    const wildcard = wildcardFromMask(mask);
    const maskText = intToIp(mask);
    const subnet = (i * 13) % 200;
    const wildcardText = intToIp(wildcard);
    const wrongs = [
      intToIp((wildcard - 1) >>> 0),
      intToIp((wildcard + 1) >>> 0),
      intToIp(wildcard ^ 255)
    ];
    return pushQuestion(
      "CCNA advanced",
      "ACL / OSPF",
      `What is the wildcard mask for subnet mask ${maskText} on network 10.${subnet}.0.0?`,
      wildcardText,
      wrongs,
      "Wildcard mask is the inverse of the subnet mask."
    );
  });

  // CCNA beginner: subnet mask from prefix
  const maskPrefixes = [16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28];
  createSeries(900, (i) => {
    const prefix = maskPrefixes[i % maskPrefixes.length];
    const subnet = (i * 19) % 200;
    const mask = intToIp(maskFromPrefix(prefix));
    const wrongPrefixA = Math.min(30, prefix + 1);
    const wrongPrefixB = Math.max(8, prefix - 1);
    const wrongs = [
      intToIp(maskFromPrefix(wrongPrefixA)),
      intToIp(maskFromPrefix(wrongPrefixB)),
      "255.255.255.0"
    ];
    return pushQuestion(
      "CCNA beginner",
      "Subnetting",
      `What subnet mask corresponds to /${prefix} for network 10.${subnet}.0.0?`,
      mask,
      wrongs,
      "A subnet mask is the dotted-decimal form of the prefix length."
    );
  });

  // CCNA advanced: smallest prefix for hosts
  createSeries(600, (i) => {
    const hosts = 12 + ((i * 17) % 600);
    const prefix = smallestPrefixForHosts(hosts);
    const wrongs = [
      `/${Math.min(30, prefix + 1)}`,
      `/${Math.max(16, prefix - 1)}`,
      "/24"
    ];
    return pushQuestion(
      "CCNA advanced",
      "Subnetting",
      `What is the smallest subnet prefix that supports ${hosts} hosts?`,
      `/${prefix}`,
      wrongs,
      "Pick the smallest prefix that provides at least the required host count."
    );
  });

  // CCNA beginner: VLAN access command
  createSeries(400, (i) => {
    const vlan = 2 + ((i * 7) % 400);
    const intf = (i % 24) + 1;
    const question = `Which command assigns interface fa0/${intf} to VLAN ${vlan}?`;
    const correct = `switchport access vlan ${vlan}`;
    const wrongs = [
      `switchport trunk allowed vlan ${vlan}`,
      `vlan ${vlan}`,
      "switchport mode trunk"
    ];
    return pushQuestion(
      "CCNA beginner",
      "VLAN",
      question,
      correct,
      wrongs,
      "Access ports are assigned with switchport access vlan <id>."
    );
  });

  // CCNA advanced: STP root primary command
  createSeries(300, (i) => {
    const vlan = 1 + ((i * 9) % 400);
    const question = `Which command makes this switch the root primary for VLAN ${vlan}?`;
    const correct = `spanning-tree vlan ${vlan} root primary`;
    const wrongs = [
      `spanning-tree vlan ${vlan} root secondary`,
      `spanning-tree vlan ${vlan} priority 65535`,
      `spanning-tree mst ${vlan} root primary`
    ];
    return pushQuestion(
      "CCNA advanced",
      "STP",
      question,
      correct,
      wrongs,
      "Root primary sets a lower bridge priority for the specified VLAN."
    );
  });

  // CCNA advanced: OSPF adjacency requirement
  createSeries(300, (i) => {
    const area = (i % 50) + 1;
    const intf = `g0/${i % 3}`;
    const neighborIp = `10.${(i * 7) % 200}.${(i * 11) % 200}.2`;
    const question = `R1 and R2 on area ${area} (interface ${intf}, neighbor ${neighborIp}) are not forming OSPF adjacency. Which mismatch can prevent neighbor formation?`;
    const correct = "Hello/dead timers";
    const wrongs = ["Hostname", "Interface description", "Console password"];
    return pushQuestion(
      "CCNA advanced",
      "OSPF",
      question,
      correct,
      wrongs,
      "OSPF neighbors must match key parameters like hello/dead timers and area."
    );
  });

  // CCNA advanced: ACL placement
  createSeries(300, (i) => {
    const vlan = 10 + ((i * 5) % 200);
    const serverIp = `172.16.${(i * 7) % 200}.10`;
    const question = `Where should an extended ACL be placed to control traffic from VLAN ${vlan} to server ${serverIp}?`;
    const correct = "Close to the source";
    const wrongs = ["Close to the destination", "Only on loopback", "Only on WAN outbound"];
    return pushQuestion(
      "CCNA advanced",
      "ACL",
      question,
      correct,
      wrongs,
      "Extended ACLs should be placed close to the source to stop unwanted traffic early."
    );
  });

  // CCNA advanced: NAT overload concept
  createSeries(300, (i) => {
    const lan = 10 + ((i * 3) % 200);
    const publicIp = `203.0.113.${(i % 200) + 1}`;
    const question = `Which NAT feature lets many hosts in 192.168.${lan}.0/24 share public IP ${publicIp} using ports?`;
    const correct = "PAT (NAT overload)";
    const wrongs = ["Static NAT", "Dynamic NAT pool only", "NAT exemption"];
    return pushQuestion(
      "CCNA advanced",
      "NAT",
      question,
      correct,
      wrongs,
      "PAT multiplexes sessions using unique source port translations."
    );
  });

  // CCNP level: scenario-based templates
  const ccnpTemplates = [
    (i) => ({
      topic: "BGP",
      question: `AS 650${(i % 90) + 10} wants to prefer one egress path on edge ${i % 4}. Which BGP attribute should be set within the AS to influence outbound selection?`,
      correct: "Local Preference",
      wrongs: ["MED", "Origin", "AS Path length"],
      explanation: "Local Preference is propagated within an AS and influences outbound path choice."
    }),
    (i) => ({
      topic: "OSPF",
      question: `You need to reduce LSA flooding in area ${(i % 50) + 1} on router R${(i % 5) + 1}. Which OSPF area type blocks external LSAs by default?`,
      correct: "Stub area",
      wrongs: ["Backbone area", "Totally normal area", "Transit area"],
      explanation: "Stub areas block external (Type 5) LSAs by default."
    }),
    (i) => ({
      topic: "QoS",
      question: `Which QoS mechanism provides strict priority treatment for voice traffic on WAN interface g0/${i % 2} (policy ${i % 25})?`,
      correct: "LLQ",
      wrongs: ["WRED", "Policing", "CBWFQ only"],
      explanation: "Low Latency Queueing provides strict-priority handling for critical traffic."
    }),
    (i) => ({
      topic: "MPLS",
      question: `In an MPLS core for VRF-${(i % 50) + 1} (PE-${(i % 6) + 1}), what is used to forward packets between provider routers?`,
      correct: "Label switching",
      wrongs: ["MAC learning tables", "ARP cache", "Pure IP lookup only"],
      explanation: "MPLS core routers forward based on labels."
    }),
    (i) => ({
      topic: "High Availability",
      question: `Which protocol provides a virtual default gateway for VLAN ${(i % 100) + 1}?`,
      correct: "HSRP",
      wrongs: ["VRF", "BFD", "LACP"],
      explanation: "HSRP uses a virtual IP to provide default gateway redundancy."
    })
  ];

  createSeries(700, (i) => {
    const template = ccnpTemplates[i % ccnpTemplates.length](i);
    return pushQuestion(
      "CCNP level",
      template.topic,
      template.question,
      template.correct,
      template.wrongs,
      template.explanation
    );
  });

  writeJson(quizPath, baseQuestions.concat(generated));
  return { base: baseQuestions.length, generated: generated.length };
}

const labsResult = generateLabs();
const quizResult = generateQuestions();

console.log(`Labs: ${labsResult.base} base + ${labsResult.generated} generated`);
console.log(`Questions: ${quizResult.base} base + ${quizResult.generated} generated`);
