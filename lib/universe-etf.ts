/**
 * BIAS-FREE BACKTEST UNIVERSE.
 *
 * The theme graph in trends.ts was authored in 2026 with full knowledge of which
 * AI names won. Backtesting it to 2019 is survivorship + look-ahead bias: a 2019
 * investor could not have known to build an "AI Compute" basket around
 * NVDA/AVGO/MRVL, and every ticker in that list is there *because* it won.
 *
 * This universe removes that. Properties:
 *  - Every instrument listed BEFORE 2018, so all were investable on day one.
 *  - Chosen structurally (every major sector / asset class / region), not by
 *    performance — no name is here because it did well.
 *  - ETFs, so constituent deaths, delistings, additions and index rebalances are
 *    handled INSIDE the wrapper. There is no dead-company gap: if a component
 *    went bankrupt, the ETF's own return already reflects it.
 *
 * It is a fair test of the STRATEGY LOGIC (momentum ranking + trend filter +
 * risk sleeves) rather than a test of a hand-picked winners list.
 */
export const ETF_UNIVERSE: string[] = [
  // US sectors (SPDR, all 1998-2015)
  "XLK", "XLF", "XLE", "XLV", "XLI", "XLY", "XLP", "XLU", "XLB", "XLRE",
  // Industries / sub-sectors
  "SMH", "SOXX", "IGV", "IBB", "XBI", "KRE", "ITB", "XOP", "XME", "IYT",
  "HACK", "SKYY", "ROBO", "TAN", "URA", "LIT", "JETS", "GDX", "XRT", "PBW",
  // Broad equity / size / style
  "SPY", "QQQ", "IWM", "MDY", "DIA", "VTV", "VUG", "MTUM", "QUAL", "USMV",
  // International
  "EFA", "EEM", "EWJ", "EWG", "EWZ", "FXI", "INDA", "EWT", "EWY", "EWU",
  // Bonds / rates / credit
  "TLT", "IEF", "SHY", "LQD", "HYG", "TIP", "EMB", "BND",
  // Commodities / real assets
  "SLV", "DBC", "USO", "UNG", "DBA", "VNQ", "PPLT",
  // NOTE: GLD deliberately excluded — it is the dedicated gold sleeve, and a
  // symbol cannot be both a sleeve and an equity candidate.
];
