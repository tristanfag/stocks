// The supply-chain graph that powers the trend engine.
// Each node is a theme with constituent tickers, downstream beneficiaries,
// and a one-line "logic narrative" surfaced in the UI.

export type TrendNode = {
  id: string;
  title: string;
  blurb: string;
  /** "If this is hot, here's why and what flows from it." */
  logic: string;
  symbols: string[];
  /** Downstream beneficiary node IDs (supply-chain edges). */
  feeds: string[];
  /** Optional parent (back-edge for breadcrumbs). */
  parent?: string;
  group: "ai" | "energy" | "infra" | "frontier" | "defense" | "digital" | "health";
};

export const TREND_GRAPH: Record<string, TrendNode> = {
  "ai-compute": {
    id: "ai-compute",
    title: "AI Compute",
    blurb: "Accelerators, networking and the silicon stack training the next models.",
    logic:
      "Generative AI capex is the largest infra cycle since fiber. Big Five hyperscaler capex >$600B in 2026, +50% YoY. Every dollar of GPU spend pulls dollars into foundries (TSMC), lithography (ASML), HBM memory (Micron), optical interconnect, datacenters, the power grid that feeds them, and increasingly the application layer (CRM/NOW) and embodied AI (humanoid robotics).",
    symbols: ["NVDA", "AMD", "AVGO", "TSM", "ARM", "MRVL", "ASML", "SMCI"],
    feeds: ["datacenters", "foundries", "lithography", "memory", "photonics", "ai-software", "humanoid-robotics"],
    group: "ai",
  },
  "datacenters": {
    id: "datacenters",
    title: "Datacenters & Hyperscale",
    blurb: "REITs, networking, racks and cooling for the AI buildout.",
    logic:
      "Hyperscale racks now pull 80–120kW each — 100x a 2010 rack. Result: square footage (EQIX/DLR), power gear (VRT), high-speed switching (ANET) and rack-to-rack optics are all in structural shortage. Datacenters need utilities directly (PPA deals with Constellation/Vistra) and AI workloads expand the cybersecurity attack surface dramatically.",
    symbols: ["EQIX", "DLR", "VRT", "ANET", "NVDA", "AVGO", "MRVL", "MU"],
    feeds: ["power-grid", "nuclear", "cooling-thermal", "memory", "photonics", "ai-power-utilities", "cybersecurity"],
    parent: "ai-compute",
    group: "infra",
  },
  "power-grid": {
    id: "power-grid",
    title: "Power & Grid Infrastructure",
    blurb: "Transformers, switchgear, gas turbines feeding 1GW AI campuses.",
    logic:
      "The US grid wasn't built for 1GW campuses. Transformer lead times are 2+ years; gas turbine slots are sold out into 2028. Whoever owns the bottleneck (GEV, ETN, ABB) prints.",
    symbols: ["GEV", "ETN", "ABB", "EMR", "HUBB", "AME", "ROK", "PWR"],
    feeds: ["nuclear"],
    parent: "datacenters",
    group: "energy",
  },
  "nuclear": {
    id: "nuclear",
    title: "Nuclear & Uranium",
    blurb: "Reactors, SMRs and fuel for 24/7 AI baseload.",
    logic:
      "AI loads can't run on intermittent renewables. Hyperscalers (MSFT, AMZN, GOOGL) are signing PPAs with operating reactors and funding SMR developers. Uranium remains supply-constrained vs. a multi-decade demand curve.",
    symbols: ["CCJ", "NXE", "UEC", "SMR", "OKLO", "BWXT", "LEU", "URA"],
    feeds: [],
    parent: "power-grid",
    group: "energy",
  },
  "cooling-thermal": {
    id: "cooling-thermal",
    title: "Cooling & Thermal",
    blurb: "Liquid cooling, CDUs, HVAC for >100kW racks.",
    logic:
      "Air cooling caps out around 30kW/rack; AI racks are 5–10x that. Direct-to-chip and immersion liquid cooling are no longer optional. Vertiv, Modine and JCI are the obvious picks.",
    symbols: ["VRT", "MOD", "AAON", "JCI", "NVT"],
    feeds: [],
    parent: "datacenters",
    group: "infra",
  },
  "memory": {
    id: "memory",
    title: "Memory / HBM",
    blurb: "High-bandwidth memory stacks every GPU is bottlenecked on.",
    logic:
      "An H100 is 80GB of HBM3; a B200 is 192GB of HBM3e. HBM is sold out through 2026; pricing is 5–8x commodity DRAM. Micron is the only US-listed pure-play; Western Digital and Seagate ride the storage build.",
    symbols: ["MU", "WDC", "STX"],
    feeds: [],
    parent: "datacenters",
    group: "ai",
  },
  "photonics": {
    id: "photonics",
    title: "Photonics & Optical",
    blurb: "Lasers, silicon photonics, optical interconnect for AI bandwidth.",
    logic:
      "Copper hits a wall around 200Gbps; AI clusters need 800G/1.6T optical between racks. Co-packaged optics (CPO) shifts spend from copper to glass. Coherent, Lumentum, Fabrinet and IPG own pieces of the chain.",
    symbols: ["IPGP", "COHR", "LITE", "FN", "AAOI", "MKSI", "ONTO"],
    feeds: [],
    parent: "datacenters",
    group: "ai",
  },
  "foundries": {
    id: "foundries",
    title: "Foundries",
    blurb: "Tape-out and wafer capacity gates the entire AI stack.",
    logic:
      "Every AI chip ships through a leading-edge node. TSMC has near-monopoly on advanced nodes; Intel Foundry is the contested second source; GlobalFoundries owns mature/automotive nodes.",
    symbols: ["TSM", "INTC", "GFS", "UMC"],
    feeds: ["lithography"],
    parent: "ai-compute",
    group: "ai",
  },
  "lithography": {
    id: "lithography",
    title: "Lithography & WFE",
    blurb: "EUV monopoly + the deposition/etch gear behind every wafer.",
    logic:
      "ASML is the only EUV vendor in the world. AMAT, LRCX and KLAC own deposition, etch and metrology. Wafer fab equipment is the picks-and-shovels layer beneath every AI chip.",
    symbols: ["ASML", "KLAC", "AMAT", "LRCX", "ACLS"],
    feeds: [],
    parent: "ai-compute",
    group: "ai",
  },
  "quantum": {
    id: "quantum",
    title: "Quantum Computing",
    blurb: "Pure-plays + diversified incumbents racing toward fault tolerance.",
    logic:
      "Quantum is pre-revenue but post-curiosity. IBM, Google and Honeywell-spinout Quantinuum lead on hardware; IonQ, Rigetti and D-Wave are the listed pure-plays. Photonics overlaps as a qubit modality.",
    symbols: ["IONQ", "RGTI", "QBTS", "QUBT", "IBM", "HON"],
    feeds: ["photonics"],
    group: "frontier",
  },
  "defense-ai": {
    id: "defense-ai",
    title: "Defense & Autonomy",
    blurb: "Drones, comms, autonomy software, the new primes.",
    logic:
      "Ukraine made drones and software the dominant force multiplier. Palantir, Anduril (private), Kratos and the legacy primes are repositioning around autonomy and AI-enabled platforms.",
    symbols: ["PLTR", "LDOS", "BAH", "KTOS", "CW", "RTX", "LMT", "NOC"],
    feeds: [],
    group: "defense",
  },
  "crypto-infra": {
    id: "crypto-infra",
    title: "Crypto Infrastructure",
    blurb: "Exchanges, treasuries, miners — leveraged BTC beta.",
    logic:
      "Spot ETFs unlocked institutional flow. Coinbase is the regulated venue; MicroStrategy is the levered treasury; miners are operational leverage on hash + BTC price.",
    symbols: ["COIN", "MSTR", "MARA", "RIOT", "CLSK", "HUT", "BITF"],
    feeds: [],
    group: "digital",
  },
  "glp1-pharma": {
    id: "glp1-pharma",
    title: "GLP-1 / Metabolic",
    blurb: "Obesity drugs reshaping consumer staples and healthcare flows.",
    logic:
      "GLP-1 adoption is the largest pharma category since statins. Direct beneficiaries: Lilly, Novo. Tele-health distribution: Hims. Second-derivative: amino acid suppliers, manufacturing capacity.",
    symbols: ["LLY", "NVO", "HIMS", "AMGN", "VKTX"],
    feeds: [],
    group: "health",
  },

  // ===== Themes added 2026-05-11 based on Morgan Stanley / Goldman / news pulse =====
  "humanoid-robotics": {
    id: "humanoid-robotics",
    title: "Humanoid Robotics & Embodied AI",
    blurb: "Bipedal robots moving from pilots to mass production — Optimus, Figure, Apptronik leading.",
    logic:
      "Embodied AI is the platform after LLMs. Tesla converted its Fremont Model S/X line to Optimus production for 2027 mass-market launch; Figure deployed at BMW Spartanburg; UBTECH mass-producing in China. Public pure-plays are scarce; play the picks-and-shovels: actuators/automation (ROK, ABB), machine vision (CGNX), warehouse robotics (SYM), and the diversified-but-largest-catalyst name (TSLA).",
    symbols: ["TSLA", "SYM", "ROK", "ABB", "CGNX", "TRMB"],
    feeds: [],
    parent: "ai-compute",
    group: "frontier",
  },
  "cybersecurity": {
    id: "cybersecurity",
    title: "Cybersecurity & Identity",
    blurb: "AI agents are blowing up the enterprise attack surface — AI-native security in demand.",
    logic:
      "Every AI agent is a new identity and a new API surface. Endpoint (CRWD, S), zero-trust networking (ZS, NET, FTNT), identity (OKTA, CYBR), platform (PANW). Morgan Stanley's top-3 2026 theme. The AI buildout's mandatory complement.",
    symbols: ["CRWD", "PANW", "ZS", "S", "NET", "OKTA", "FTNT", "CYBR"],
    feeds: [],
    parent: "datacenters",
    group: "infra",
  },
  "ai-software": {
    id: "ai-software",
    title: "AI Application & Productivity",
    blurb: "Goldman's 'next leg' — applications and productivity beneficiaries of the AI buildout.",
    logic:
      "After picks-and-shovels (NVDA/TSM) and buildout (datacenters), monetization comes through applications. CRM/NOW embedding AI agents into workflows; SNOW/DDOG/MDB providing the data plumbing; PLTR for enterprise/government; DUOL for consumer AI. Investor rotation OUT of pure infra INTO software is one of the loudest 2026 themes.",
    symbols: ["CRM", "NOW", "SNOW", "DDOG", "MDB", "PLTR", "DUOL"],
    feeds: [],
    parent: "ai-compute",
    group: "ai",
  },
  "stablecoin-payments": {
    id: "stablecoin-payments",
    title: "Stablecoins & Payment Rails",
    blurb: "GENIUS Act + CLARITY Act creating regulated US framework — Circle public, banks integrating.",
    logic:
      "Stablecoins moving from grey-market to regulated US rails. CRCL (Circle, USDC issuer) is the cleanest pure-play. PYPL launched PYUSD. HOOD building stablecoin features. Legacy payments (V, MA) re-architecting around it. Bullish on TradFi integration tailwind.",
    symbols: ["CRCL", "HOOD", "PYPL", "V", "MA", "COIN"],
    feeds: [],
    group: "digital",
  },
  "ai-power-utilities": {
    id: "ai-power-utilities",
    title: "AI Power Utilities",
    blurb: "Utilities signing nuclear PPAs and direct deals with hyperscalers — who powers AI.",
    logic:
      "MSFT signed Three Mile Island restart with Constellation. AMZN bought Talen's nuclear-powered Cumulus campus. VST is the cleanest pure-play with both nuclear + gas. The utility-side of the AI capex theme is *finally* getting priced; previously left for dead, these are now structural AI beneficiaries.",
    symbols: ["CEG", "VST", "TLN", "NEE", "ETR"],
    feeds: [],
    parent: "datacenters",
    group: "energy",
  },
};

export const TREND_ROOTS = ["ai-compute", "quantum", "defense-ai", "crypto-infra", "glp1-pharma"];

export function descendants(id: string, depth = 2): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const walk = (nodeId: string, d: number) => {
    if (d <= 0) return;
    const node = TREND_GRAPH[nodeId];
    if (!node) return;
    for (const child of node.feeds) {
      if (seen.has(child)) continue;
      seen.add(child);
      out.push(child);
      walk(child, d - 1);
    }
  };
  walk(id, depth);
  return out;
}

export function allSymbols(): string[] {
  const set = new Set<string>();
  for (const node of Object.values(TREND_GRAPH)) for (const s of node.symbols) set.add(s);
  return Array.from(set);
}
