import { TREND_GRAPH } from "./trends";

export type Cap = "large" | "mid" | "small";

export type UniverseEntry = {
  symbol: string;
  name?: string;
  cap: Cap;
  themes: string[]; // theme node IDs this ticker is associated with
  flavor?: string;  // optional descriptor (eg. "small-cap photonics")
};

// Hidden Gems / discovery list — small & mid caps adjacent to the structural themes.
// These don't all live in TREND_GRAPH but are interesting screener candidates.
const DISCOVERY: UniverseEntry[] = [
  // Quantum / frontier compute
  { symbol: "QUBT", cap: "small", themes: ["quantum"], flavor: "Quantum pure-play" },
  { symbol: "ARQQ", cap: "small", themes: ["quantum"], flavor: "Quantum encryption" },
  { symbol: "RGTI", cap: "small", themes: ["quantum"], flavor: "Superconducting qubits" },

  // Photonics / optical small-caps
  { symbol: "AAOI", cap: "small", themes: ["photonics", "datacenters"], flavor: "Optical interconnect" },
  { symbol: "VECO", cap: "mid",   themes: ["photonics", "lithography"], flavor: "Process equipment" },
  { symbol: "ONTO", cap: "mid",   themes: ["photonics", "lithography"], flavor: "Inspection / metrology" },
  { symbol: "FORM", cap: "mid",   themes: ["lithography"], flavor: "Probe cards" },

  // Power / nuclear small-caps
  { symbol: "OKLO", cap: "mid",   themes: ["nuclear"], flavor: "SMR developer" },
  { symbol: "SMR",  cap: "mid",   themes: ["nuclear"], flavor: "NuScale SMR" },
  { symbol: "LEU",  cap: "mid",   themes: ["nuclear"], flavor: "Centrus / HALEU" },
  { symbol: "BWXT", cap: "mid",   themes: ["nuclear", "defense-ai"], flavor: "Naval reactors / SMRs" },
  { symbol: "NXE",  cap: "mid",   themes: ["nuclear"], flavor: "NexGen uranium" },
  { symbol: "UEC",  cap: "mid",   themes: ["nuclear"], flavor: "US uranium" },

  // Datacenter infrastructure / cooling small-caps
  { symbol: "VRT",  cap: "mid",   themes: ["datacenters", "cooling-thermal"], flavor: "Power & cooling" },
  { symbol: "MOD",  cap: "small", themes: ["cooling-thermal"], flavor: "Liquid cooling" },
  { symbol: "AAON", cap: "small", themes: ["cooling-thermal"], flavor: "HVAC" },
  { symbol: "PWR",  cap: "mid",   themes: ["power-grid"], flavor: "Utility build-out contractor" },
  { symbol: "GEV",  cap: "mid",   themes: ["power-grid"], flavor: "Grid + gas turbines" },
  { symbol: "HUBB", cap: "mid",   themes: ["power-grid"], flavor: "Electrical components" },
  { symbol: "AME",  cap: "mid",   themes: ["power-grid"], flavor: "Specialty electronics" },

  // AI silicon / networking small-mid
  { symbol: "CRDO", cap: "small", themes: ["datacenters", "photonics"], flavor: "Optical DSPs" },
  { symbol: "ALAB", cap: "mid",   themes: ["datacenters"], flavor: "Connectivity silicon" },
  { symbol: "MRVL", cap: "mid",   themes: ["datacenters", "ai-compute"], flavor: "Custom ASIC" },
  { symbol: "ASTS", cap: "small", themes: ["defense-ai"], flavor: "Direct-to-cell satellites" },
  { symbol: "RKLB", cap: "mid",   themes: ["defense-ai"], flavor: "Small-launch + Neutron" },

  // Defense / autonomy small-mid
  { symbol: "KTOS", cap: "small", themes: ["defense-ai"], flavor: "Drones + targets" },
  { symbol: "CW",   cap: "mid",   themes: ["defense-ai", "nuclear"], flavor: "Naval propulsion" },
  { symbol: "PLTR", cap: "mid",   themes: ["defense-ai"], flavor: "Autonomy software" },
  { symbol: "LDOS", cap: "mid",   themes: ["defense-ai"], flavor: "Defense IT" },
  { symbol: "BAH",  cap: "mid",   themes: ["defense-ai"], flavor: "Defense consulting" },

  // Biotech speculative
  { symbol: "VKTX", cap: "mid",   themes: ["glp1-pharma"], flavor: "Obesity drug" },
  { symbol: "CRSP", cap: "mid",   themes: [], flavor: "CRISPR therapy" },
  { symbol: "BEAM", cap: "small", themes: [], flavor: "Base editing" },
  { symbol: "EDIT", cap: "small", themes: [], flavor: "Gene editing" },
  { symbol: "NTLA", cap: "small", themes: [], flavor: "In-vivo CRISPR" },

  // Crypto-leveraged small/mid
  { symbol: "MARA", cap: "mid",   themes: ["crypto-infra"], flavor: "Largest BTC miner" },
  { symbol: "RIOT", cap: "mid",   themes: ["crypto-infra"], flavor: "BTC miner" },
  { symbol: "CLSK", cap: "small", themes: ["crypto-infra"], flavor: "BTC miner" },
  { symbol: "MSTR", cap: "mid",   themes: ["crypto-infra"], flavor: "Levered BTC treasury" },

  // Fintech disruptors
  { symbol: "SOFI", cap: "mid",   themes: [], flavor: "Digital bank" },
  { symbol: "HOOD", cap: "mid",   themes: ["crypto-infra"], flavor: "Retail brokerage" },
  { symbol: "AFRM", cap: "mid",   themes: [], flavor: "BNPL" },
  { symbol: "UPST", cap: "small", themes: [], flavor: "AI lending" },

  // Niche memory / storage / interconnect
  { symbol: "WDC",  cap: "mid",   themes: ["memory"], flavor: "HDD + NAND" },
  { symbol: "STX",  cap: "mid",   themes: ["memory"], flavor: "HDD storage" },
  { symbol: "NVT",  cap: "mid",   themes: ["cooling-thermal", "datacenters"], flavor: "Power + connectors" },

  // Reshoring / industrial bottlenecks
  { symbol: "ROK",  cap: "mid",   themes: ["power-grid"], flavor: "Industrial automation" },
  { symbol: "ETN",  cap: "mid",   themes: ["power-grid", "datacenters"], flavor: "Power management" },
  { symbol: "JCI",  cap: "mid",   themes: ["cooling-thermal"], flavor: "Building tech" },
  { symbol: "CARR", cap: "mid",   themes: ["cooling-thermal"], flavor: "HVAC" },

  // Mega-caps to anchor the universe
  { symbol: "AAPL", cap: "large", themes: [] },
  { symbol: "MSFT", cap: "large", themes: ["ai-compute", "datacenters"] },
  { symbol: "GOOGL",cap: "large", themes: ["ai-compute"] },
  { symbol: "AMZN", cap: "large", themes: ["datacenters"] },
  { symbol: "META", cap: "large", themes: ["ai-compute"] },
  { symbol: "TSLA", cap: "large", themes: ["humanoid-robotics"], flavor: "Optimus humanoid pivot" },
  { symbol: "BRK-B",cap: "large", themes: [] },
  { symbol: "JPM",  cap: "large", themes: [] },
  { symbol: "XOM",  cap: "large", themes: ["power-grid"] },
  { symbol: "LLY",  cap: "large", themes: ["glp1-pharma"] },
  { symbol: "NVO",  cap: "large", themes: ["glp1-pharma"] },

  // ===== 2026-05-11 universe additions: humanoid robotics, cybersecurity, AI software, stablecoin, AI utilities =====

  // Humanoid robotics / embodied AI picks-and-shovels
  { symbol: "SYM",  cap: "mid",   themes: ["humanoid-robotics"], flavor: "Warehouse robotics" },
  { symbol: "ROK",  cap: "mid",   themes: ["humanoid-robotics", "power-grid"], flavor: "Industrial automation backbone" },
  { symbol: "ABB",  cap: "mid",   themes: ["humanoid-robotics", "power-grid"], flavor: "Robotics arms + grid gear" },
  { symbol: "CGNX", cap: "mid",   themes: ["humanoid-robotics"], flavor: "Machine vision" },
  { symbol: "TRMB", cap: "mid",   themes: ["humanoid-robotics"], flavor: "Positioning / autonomy" },

  // Cybersecurity — Morgan Stanley top-3 2026 theme
  { symbol: "CRWD", cap: "mid",   themes: ["cybersecurity"], flavor: "Endpoint detection leader" },
  { symbol: "PANW", cap: "mid",   themes: ["cybersecurity"], flavor: "Network security platform" },
  { symbol: "ZS",   cap: "mid",   themes: ["cybersecurity"], flavor: "Zero-trust networking" },
  { symbol: "S",    cap: "mid",   themes: ["cybersecurity"], flavor: "SentinelOne — AI-native EDR" },
  { symbol: "NET",  cap: "mid",   themes: ["cybersecurity"], flavor: "Cloudflare — edge + zero-trust" },
  { symbol: "OKTA", cap: "mid",   themes: ["cybersecurity"], flavor: "Identity (Auth0)" },
  { symbol: "FTNT", cap: "mid",   themes: ["cybersecurity"], flavor: "Network platform" },
  { symbol: "CYBR", cap: "small", themes: ["cybersecurity"], flavor: "Privileged access" },

  // AI application / SaaS — Goldman's 'next leg' play
  { symbol: "CRM",  cap: "large", themes: ["ai-software"], flavor: "Salesforce — AI Agentforce" },
  { symbol: "NOW",  cap: "large", themes: ["ai-software"], flavor: "ServiceNow — workflow AI" },
  { symbol: "SNOW", cap: "mid",   themes: ["ai-software"], flavor: "Data warehouse + AI" },
  { symbol: "DDOG", cap: "mid",   themes: ["ai-software"], flavor: "Observability" },
  { symbol: "MDB",  cap: "mid",   themes: ["ai-software"], flavor: "Document DB" },
  { symbol: "DUOL", cap: "small", themes: ["ai-software"], flavor: "Consumer AI" },

  // Stablecoins / payment rails
  { symbol: "CRCL", cap: "small", themes: ["stablecoin-payments"], flavor: "USDC issuer (Circle IPO)" },
  { symbol: "PYPL", cap: "mid",   themes: ["stablecoin-payments"], flavor: "PYUSD stablecoin" },
  { symbol: "V",    cap: "large", themes: ["stablecoin-payments"], flavor: "Visa — payment rails" },
  { symbol: "MA",   cap: "large", themes: ["stablecoin-payments"], flavor: "Mastercard — payment rails" },

  // AI Power Utilities — the 'who powers AI' trade
  { symbol: "CEG",  cap: "mid",   themes: ["ai-power-utilities", "nuclear"], flavor: "Constellation — MSFT TMI PPA" },
  { symbol: "VST",  cap: "mid",   themes: ["ai-power-utilities", "nuclear"], flavor: "Vistra — cleanest AI utility pure-play" },
  { symbol: "TLN",  cap: "mid",   themes: ["ai-power-utilities", "nuclear"], flavor: "Talen — AMZN Cumulus campus" },
  { symbol: "NEE",  cap: "large", themes: ["ai-power-utilities"], flavor: "NextEra — renewables + nuclear" },
  { symbol: "ETR",  cap: "mid",   themes: ["ai-power-utilities"], flavor: "Entergy — datacenter PPAs" },
];

export function buildUniverse(): UniverseEntry[] {
  const map = new Map<string, UniverseEntry>();
  // Seed from trend graph (everything large by default)
  for (const node of Object.values(TREND_GRAPH)) {
    for (const sym of node.symbols) {
      const existing = map.get(sym);
      if (existing) {
        if (!existing.themes.includes(node.id)) existing.themes.push(node.id);
      } else {
        map.set(sym, { symbol: sym, cap: "large", themes: [node.id] });
      }
    }
  }
  // Layer in discovery list (overrides cap and adds themes)
  for (const d of DISCOVERY) {
    const existing = map.get(d.symbol);
    if (existing) {
      existing.cap = d.cap;
      if (d.flavor) existing.flavor = d.flavor;
      for (const t of d.themes) if (!existing.themes.includes(t)) existing.themes.push(t);
    } else {
      map.set(d.symbol, { ...d });
    }
  }
  return Array.from(map.values());
}
