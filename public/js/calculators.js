(function () {
  if (document.body.dataset.page !== "calculators") return;

  function ipToInt(ip) {
    const octets = ip.split(".").map(Number);
    if (octets.length !== 4 || octets.some((o) => Number.isNaN(o) || o < 0 || o > 255)) {
      throw new Error("Invalid IPv4 address.");
    }

    return ((octets[0] << 24) >>> 0) + ((octets[1] << 16) >>> 0) + ((octets[2] << 8) >>> 0) + (octets[3] >>> 0);
  }

  function intToIp(value) {
    return [
      (value >>> 24) & 255,
      (value >>> 16) & 255,
      (value >>> 8) & 255,
      value & 255
    ].join(".");
  }

  function cidrToMask(cidr) {
    if (cidr < 0 || cidr > 32) throw new Error("CIDR must be between 0 and 32.");
    const mask = cidr === 0 ? 0 : (~((1 << (32 - cidr)) - 1) >>> 0);
    return intToIp(mask);
  }

  function maskToCidr(mask) {
    const maskInt = ipToInt(mask);
    const binary = maskInt.toString(2).padStart(32, "0");
    if (/01/.test(binary)) throw new Error("Mask is not contiguous.");
    return binary.split("1").length - 1;
  }

  function wildcardMask(mask) {
    const maskInt = ipToInt(mask);
    return intToIp((~maskInt) >>> 0);
  }

  function wildcardToMask(wildcard) {
    const wildcardInt = ipToInt(wildcard);
    return intToIp((~wildcardInt) >>> 0);
  }

  function binaryOctetToDecimal(bin) {
    if (!/^[01]{8}$/.test(bin)) throw new Error("Each binary octet must be 8 bits.");
    return parseInt(bin, 2);
  }

  function classifyIpv4(ip) {
    const octets = ip.split(".").map(Number);
    if (octets.length !== 4 || octets.some((o) => Number.isNaN(o) || o < 0 || o > 255)) {
      throw new Error("Invalid IPv4 address.");
    }

    const [o1, o2] = octets;
    let ipClass = "E";
    let defaultMask = "Experimental";

    if (o1 >= 1 && o1 <= 126) {
      ipClass = "A";
      defaultMask = "/8";
    } else if (o1 >= 128 && o1 <= 191) {
      ipClass = "B";
      defaultMask = "/16";
    } else if (o1 >= 192 && o1 <= 223) {
      ipClass = "C";
      defaultMask = "/24";
    } else if (o1 >= 224 && o1 <= 239) {
      ipClass = "D";
      defaultMask = "Multicast";
    }

    let scope = "Public";
    if (o1 === 10 || (o1 === 172 && o2 >= 16 && o2 <= 31) || (o1 === 192 && o2 === 168)) {
      scope = "Private";
    } else if (o1 === 127) {
      scope = "Loopback";
    } else if (o1 === 169 && o2 === 254) {
      scope = "Link-local";
    } else if (o1 >= 224 && o1 <= 239) {
      scope = "Multicast";
    } else if (o1 >= 240) {
      scope = "Reserved";
    }

    return { ipClass, defaultMask, scope };
  }

  function requiredHostsToCidr(hosts) {
    if (!Number.isFinite(hosts) || hosts < 1) throw new Error("Hosts must be at least 1.");
    const needed = hosts + 2;
    const hostBits = Math.ceil(Math.log2(needed));
    if (hostBits > 32) throw new Error("Host count too large.");
    const cidr = 32 - hostBits;
    const usable = Math.max(2 ** hostBits - 2, 0);
    return { cidr, usable };
  }

  function subnetsFromCidr(baseCidr, subnets) {
    if (!Number.isFinite(baseCidr) || baseCidr < 0 || baseCidr > 32) {
      throw new Error("Base CIDR must be between 0 and 32.");
    }
    if (!Number.isFinite(subnets) || subnets < 1) {
      throw new Error("Subnets must be at least 1.");
    }
    const subnetBits = Math.ceil(Math.log2(subnets));
    const newCidr = baseCidr + subnetBits;
    if (newCidr > 32) throw new Error("Too many subnets for the base CIDR.");
    const totalSubnets = 2 ** subnetBits;
    const hosts = Math.max(2 ** (32 - newCidr) - 2, 0);
    return { newCidr, totalSubnets, hosts };
  }

  function blockSizeFromCidr(cidr) {
    if (!Number.isFinite(cidr) || cidr < 0 || cidr > 32) {
      throw new Error("CIDR must be between 0 and 32.");
    }
    const mask = cidrToMask(cidr);
    const octets = mask.split(".").map(Number);
    let octetIndex = octets.findIndex((o) => o !== 255);
    if (octetIndex === -1) octetIndex = 3;
    const blockSize = 256 - octets[octetIndex];
    return { mask, blockSize, octet: octetIndex + 1 };
  }

  function showResult(id, value, isError = false) {
    const target = document.getElementById(id);
    if (!target) return;
    target.className = isError ? "status-bad" : "status-good";
    target.textContent = value;
  }

  function bindSubnetCalculator() {
    const button = document.getElementById("calc-subnet-btn");
    button.addEventListener("click", () => {
      try {
        const ip = document.getElementById("calc-subnet-ip").value.trim();
        const cidr = Number(document.getElementById("calc-subnet-cidr").value);
        const maskInt = ipToInt(cidrToMask(cidr));
        const ipInt = ipToInt(ip);

        const network = ipInt & maskInt;
        const broadcast = network | (~maskInt >>> 0);
        const hosts = Math.max(2 ** (32 - cidr) - 2, 0);

        showResult(
          "calc-subnet-result",
          `Network: ${intToIp(network)} | Broadcast: ${intToIp(broadcast)} | Hosts: ${hosts}`
        );
      } catch (error) {
        showResult("calc-subnet-result", error.message, true);
      }
    });
  }

  function bindCidrCalculator() {
    document.getElementById("calc-cidr-btn").addEventListener("click", () => {
      try {
        const mask = document.getElementById("calc-cidr-mask").value.trim();
        const cidr = maskToCidr(mask);
        showResult("calc-cidr-result", `CIDR: /${cidr}`);
      } catch (error) {
        showResult("calc-cidr-result", error.message, true);
      }
    });
  }

  function bindWildcardCalculator() {
    document.getElementById("calc-wildcard-btn").addEventListener("click", () => {
      try {
        const mask = document.getElementById("calc-wildcard-mask").value.trim();
        showResult("calc-wildcard-result", `Wildcard: ${wildcardMask(mask)}`);
      } catch (error) {
        showResult("calc-wildcard-result", error.message, true);
      }
    });
  }

  function bindIpv4ToBinary() {
    document.getElementById("calc-ipv4-binary-btn").addEventListener("click", () => {
      try {
        const ip = document.getElementById("calc-ipv4-binary-ip").value.trim();
        const octets = ip.split(".").map(Number);
        if (octets.length !== 4 || octets.some((o) => Number.isNaN(o) || o < 0 || o > 255)) {
          throw new Error("Invalid IPv4 address.");
        }

        const binary = octets.map((o) => o.toString(2).padStart(8, "0")).join(".");
        showResult("calc-ipv4-binary-result", binary);
      } catch (error) {
        showResult("calc-ipv4-binary-result", error.message, true);
      }
    });
  }

  function bindBinaryToIpv4() {
    document.getElementById("calc-binary-ipv4-btn").addEventListener("click", () => {
      try {
        const input = document.getElementById("calc-binary-ipv4-bin").value.trim();
        const parts = input.split(".");
        if (parts.length !== 4) throw new Error("Enter 4 binary octets separated by dots.");

        const ip = parts.map(binaryOctetToDecimal).join(".");
        showResult("calc-binary-ipv4-result", ip);
      } catch (error) {
        showResult("calc-binary-ipv4-result", error.message, true);
      }
    });
  }

  function bindHostsCalculator() {
    document.getElementById("calc-hosts-btn").addEventListener("click", () => {
      try {
        const cidr = Number(document.getElementById("calc-hosts-cidr").value);
        if (Number.isNaN(cidr) || cidr < 0 || cidr > 32) throw new Error("CIDR must be between 0 and 32.");
        const hosts = Math.max(2 ** (32 - cidr) - 2, 0);
        showResult("calc-hosts-result", `Usable hosts: ${hosts}`);
      } catch (error) {
        showResult("calc-hosts-result", error.message, true);
      }
    });
  }

  function bindWildcardToMask() {
    document.getElementById("calc-wildcard-to-mask-btn").addEventListener("click", () => {
      try {
        const wildcard = document.getElementById("calc-wildcard-mask-to-subnet").value.trim();
        showResult("calc-wildcard-to-mask-result", `Subnet mask: ${wildcardToMask(wildcard)}`);
      } catch (error) {
        showResult("calc-wildcard-to-mask-result", error.message, true);
      }
    });
  }

  function bindIpClassFinder() {
    document.getElementById("calc-ip-class-btn").addEventListener("click", () => {
      try {
        const ip = document.getElementById("calc-ip-class-ip").value.trim();
        const result = classifyIpv4(ip);
        showResult(
          "calc-ip-class-result",
          `Class ${result.ipClass} | Default: ${result.defaultMask} | ${result.scope}`
        );
      } catch (error) {
        showResult("calc-ip-class-result", error.message, true);
      }
    });
  }

  function bindHostsToCidr() {
    document.getElementById("calc-hosts-to-cidr-btn").addEventListener("click", () => {
      try {
        const hosts = Number(document.getElementById("calc-hosts-to-cidr").value);
        const result = requiredHostsToCidr(hosts);
        showResult(
          "calc-hosts-to-cidr-result",
          `CIDR: /${result.cidr} | Usable hosts: ${result.usable}`
        );
      } catch (error) {
        showResult("calc-hosts-to-cidr-result", error.message, true);
      }
    });
  }

  function bindSubnetsFromCidr() {
    document.getElementById("calc-subnets-btn").addEventListener("click", () => {
      try {
        const baseCidr = Number(document.getElementById("calc-subnets-base-cidr").value);
        const subnets = Number(document.getElementById("calc-subnets-count").value);
        const result = subnetsFromCidr(baseCidr, subnets);
        showResult(
          "calc-subnets-result",
          `New CIDR: /${result.newCidr} | Subnets: ${result.totalSubnets} | Hosts/subnet: ${result.hosts}`
        );
      } catch (error) {
        showResult("calc-subnets-result", error.message, true);
      }
    });
  }

  function bindBlockSize() {
    document.getElementById("calc-block-btn").addEventListener("click", () => {
      try {
        const cidr = Number(document.getElementById("calc-block-cidr").value);
        const result = blockSizeFromCidr(cidr);
        showResult(
          "calc-block-result",
          `Mask: ${result.mask} | Block size: ${result.blockSize} (octet ${result.octet})`
        );
      } catch (error) {
        showResult("calc-block-result", error.message, true);
      }
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    bindSubnetCalculator();
    bindCidrCalculator();
    bindWildcardCalculator();
    bindIpv4ToBinary();
    bindBinaryToIpv4();
    bindHostsCalculator();
    bindWildcardToMask();
    bindIpClassFinder();
    bindHostsToCidr();
    bindSubnetsFromCidr();
    bindBlockSize();
  });
})();
