export type Ticker = {
  symbol: string;
  label?: string;
  kind?: "stock" | "etf" | "crypto" | "fx" | "index";
};

export const TICKER_STRIP: Ticker[] = [
  { symbol: "^GSPC", label: "S&P 500", kind: "index" },
  { symbol: "^NDX",  label: "NDX",     kind: "index" },
  { symbol: "^DJI",  label: "DJIA",    kind: "index" },
  { symbol: "^VIX",  label: "VIX",     kind: "index" },
  { symbol: "DX-Y.NYB", label: "DXY",  kind: "fx" },
  { symbol: "CL=F",  label: "WTI",     kind: "fx" },
  { symbol: "GC=F",  label: "Gold",    kind: "fx" },
  { symbol: "BTC-USD", label: "BTC",   kind: "crypto" },
  { symbol: "ETH-USD", label: "ETH",   kind: "crypto" },
];

export const WATCHLIST: Ticker[] = [
  { symbol: "SPY",     label: "S&P 500 ETF",   kind: "etf" },
  { symbol: "QQQ",     label: "Nasdaq 100 ETF", kind: "etf" },
  { symbol: "DX-Y.NYB", label: "US Dollar Index", kind: "fx" },
  { symbol: "AAPL",    label: "Apple",         kind: "stock" },
  { symbol: "NVDA",    label: "NVIDIA",        kind: "stock" },
  { symbol: "TSLA",    label: "Tesla",         kind: "stock" },
  { symbol: "BTC-USD", label: "Bitcoin",       kind: "crypto" },
  { symbol: "ETH-USD", label: "Ethereum",      kind: "crypto" },
  { symbol: "SOL-USD", label: "Solana",        kind: "crypto" },
];

export type ThemeBasket = {
  id: string;
  title: string;
  blurb: string;
  symbols: string[];
};

export const THEME_BASKETS: ThemeBasket[] = [
  {
    id: "photonics",
    title: "Photonics & Optical",
    blurb: "Lasers, silicon photonics, optical interconnects fueling AI bandwidth.",
    symbols: ["IPGP", "COHR", "LITE", "FN", "AAOI", "MKSI", "ONTO"],
  },
  {
    id: "datacenters",
    title: "Datacenters & AI Infra",
    blurb: "Compute, networking, REITs and power for hyperscale buildout.",
    symbols: ["EQIX", "DLR", "VRT", "ANET", "NVDA", "AVGO", "MRVL", "MU"],
  },
  {
    id: "nuclear",
    title: "Nuclear & Uranium",
    blurb: "Reactors, SMRs and fuel for the AI-driven energy demand wave.",
    symbols: ["CCJ", "NXE", "UEC", "SMR", "OKLO", "BWXT", "LEU", "URA"],
  },
  {
    id: "quantum",
    title: "Quantum Computing",
    blurb: "Pure-play quantum names plus diversified incumbents.",
    symbols: ["IONQ", "RGTI", "QBTS", "QUBT", "IBM", "HON", "NVDA"],
  },
];

// Symbols that need extra love when handed to TradingView's widget.
export const TV_SYMBOL_OVERRIDES: Record<string, string> = {
  "BTC-USD": "BINANCE:BTCUSDT",
  "ETH-USD": "BINANCE:ETHUSDT",
  "SOL-USD": "BINANCE:SOLUSDT",
  "DX-Y.NYB": "TVC:DXY",
  "^GSPC": "SPX",
  "^NDX": "NDX",
  "^DJI": "DJI",
  "^VIX": "TVC:VIX",
  "CL=F": "TVC:USOIL",
  "GC=F": "TVC:GOLD",
};

export function tvSymbol(symbol: string): string {
  return TV_SYMBOL_OVERRIDES[symbol] ?? symbol;
}
