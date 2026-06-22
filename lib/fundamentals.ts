import yahooFinance from "yahoo-finance2";

yahooFinance.suppressNotices(["yahooSurvey"]);
yahooFinance.setGlobalConfig({ validation: { logErrors: false, logOptionsErrors: false } });

export type Fundamentals = {
  symbol: string;
  name: string | null;
  sector: string | null;
  industry: string | null;
  marketCap: number | null;
  enterpriseValue: number | null;

  trailingPE: number | null;
  forwardPE: number | null;
  peg: number | null;
  priceToSales: number | null;
  priceToBook: number | null;
  evToEbitda: number | null;
  dividendYield: number | null;

  profitMargin: number | null;        // 0..1
  operatingMargin: number | null;
  grossMargin: number | null;
  returnOnEquity: number | null;
  returnOnAssets: number | null;
  returnOnInvestedCapital: number | null;
  debtToEquity: number | null;        // Yahoo convention: percent (e.g. 70 = 70%)
  currentRatio: number | null;
  freeCashflow: number | null;
  fcfMargin: number | null;
  altmanZ: number | null;
  piotroskiF: number | null;

  revenueGrowth: number | null;       // YoY (or 5y forecast as fallback)
  earningsGrowth: number | null;
  beta: number | null;
  shortPercentOfFloat: number | null;

  // Analyst block
  recommendationMean: number | null;  // 1..5 (1 strong buy, 5 sell)
  recommendationKey: string | null;
  numberOfAnalysts: number | null;
  targetMean: number | null;
  targetMedian: number | null;
  targetHigh: number | null;
  targetLow: number | null;

  /** Provenance — which source filled this. */
  source: "yahoo" | "stockanalysis" | null;
};

const cache = new Map<string, { ts: number; data: Fundamentals | null }>();
const TTL_MS = 30 * 60 * 1000; // 30 min

export async function getFundamentals(symbol: string): Promise<Fundamentals | null> {
  const cached = cache.get(symbol);
  if (cached && Date.now() - cached.ts < TTL_MS) return cached.data;

  let data: Fundamentals | null = null;

  // 1. Yahoo via library — fastest when not throttled.
  try {
    data = await viaYahooLibrary(symbol);
  } catch {/* swallow */}

  // 2. stockanalysis.com — reliable free source for fundamentals.
  if (!data) {
    try { data = await viaStockAnalysis(symbol); } catch {/* swallow */}
  }

  cache.set(symbol, { ts: Date.now(), data });
  return data;
}

async function viaYahooLibrary(symbol: string): Promise<Fundamentals | null> {
  const r = await yahooFinance.quoteSummary(
    symbol,
    { modules: ["summaryDetail", "defaultKeyStatistics", "financialData", "assetProfile", "price"] },
    { validateResult: false },
  );
  if (!r) return null;
  const sd = (r as any).summaryDetail ?? {};
  const dks = (r as any).defaultKeyStatistics ?? {};
  const fd = (r as any).financialData ?? {};
  const ap = (r as any).assetProfile ?? {};
  const px = (r as any).price ?? {};

  const yn = (x: any): number | null => {
    if (x == null) return null;
    if (typeof x === "number") return Number.isFinite(x) ? x : null;
    if (typeof x === "object" && "raw" in x) return typeof x.raw === "number" && Number.isFinite(x.raw) ? x.raw : null;
    return null;
  };
  const ys = (x: any): string | null => (typeof x === "string" && x ? x : null);

  return {
    symbol,
    name: ys(px.shortName) || ys(px.longName) || null,
    sector: ys(ap.sector),
    industry: ys(ap.industry),
    marketCap: yn(sd.marketCap) ?? yn(px.marketCap),
    enterpriseValue: yn(dks.enterpriseValue),

    trailingPE: yn(sd.trailingPE),
    forwardPE: yn(sd.forwardPE),
    peg: yn(dks.pegRatio),
    priceToSales: yn(sd.priceToSalesTrailing12Months),
    priceToBook: yn(dks.priceToBook),
    evToEbitda: yn(dks.enterpriseToEbitda),
    dividendYield: yn(sd.dividendYield),

    profitMargin: yn(fd.profitMargins) ?? yn(dks.profitMargins),
    operatingMargin: yn(fd.operatingMargins),
    grossMargin: yn(fd.grossMargins),
    returnOnEquity: yn(fd.returnOnEquity),
    returnOnAssets: yn(fd.returnOnAssets),
    returnOnInvestedCapital: null,
    debtToEquity: yn(fd.debtToEquity),
    currentRatio: yn(fd.currentRatio),
    freeCashflow: yn(fd.freeCashflow),
    fcfMargin: null,
    altmanZ: null,
    piotroskiF: null,

    revenueGrowth: yn(fd.revenueGrowth),
    earningsGrowth: yn(fd.earningsGrowth),
    beta: yn(sd.beta) ?? yn(dks.beta),
    shortPercentOfFloat: yn(dks.shortPercentOfFloat),

    recommendationMean: yn(fd.recommendationMean),
    recommendationKey: ys(fd.recommendationKey),
    numberOfAnalysts: yn(fd.numberOfAnalystOpinions),
    targetMean: yn(fd.targetMeanPrice),
    targetMedian: yn(fd.targetMedianPrice),
    targetHigh: yn(fd.targetHighPrice),
    targetLow: yn(fd.targetLowPrice),

    source: "yahoo",
  };
}

// ---- stockanalysis.com fallback -------------------------------------------

function parseFmt(s: string | null | undefined): number | null {
  if (s == null) return null;
  if (typeof s === "number") return Number.isFinite(s) ? s : null;
  if (typeof s !== "string") return null;
  const cleaned = s.replace(/[$,]/g, "").trim();
  if (!cleaned || cleaned.toLowerCase() === "n/a" || cleaned === "-") return null;
  if (cleaned.endsWith("%")) {
    const n = parseFloat(cleaned.slice(0, -1));
    return Number.isFinite(n) ? n / 100 : null;
  }
  const m = cleaned.match(/^([+-]?[\d.]+)\s*([KMBT])?$/i);
  if (m) {
    const base = parseFloat(m[1]);
    if (!Number.isFinite(base)) return null;
    const mult = ({ K: 1e3, M: 1e6, B: 1e9, T: 1e12 } as Record<string, number>)[(m[2] || "").toUpperCase()] ?? 1;
    return base * mult;
  }
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

function ratingFromText(s: string | null | undefined): string | null {
  if (!s) return null;
  const lower = s.toLowerCase().trim();
  if (lower.includes("strong buy")) return "strong_buy";
  if (lower.includes("strong sell")) return "sell";
  if (lower.includes("underperform")) return "underperform";
  if (lower.includes("buy")) return "buy";
  if (lower.includes("hold")) return "hold";
  if (lower.includes("sell")) return "sell";
  return null;
}
function recMeanFromKey(key: string | null): number | null {
  if (!key) return null;
  return ({ strong_buy: 1.5, buy: 2.0, hold: 3.0, underperform: 4.0, sell: 4.5 } as Record<string, number>)[key] ?? null;
}

function safeSlug(symbol: string): string | null {
  // Skip indices, futures, FX, crypto — stockanalysis.com is stocks-only.
  if (!symbol) return null;
  if (symbol.includes("-USD")) return null;
  if (symbol.startsWith("^")) return null;
  if (symbol.includes("=")) return null;
  if (symbol.includes(".")) return null;
  return symbol.toLowerCase();
}

async function viaStockAnalysis(symbol: string): Promise<Fundamentals | null> {
  const slug = safeSlug(symbol);
  if (!slug) return null;
  const url = `https://stockanalysis.com/api/symbol/s/${slug}/statistics`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0",
        Accept: "application/json",
      },
      cache: "no-store",
    });
  } catch { return null; }
  if (!res.ok) return null;
  const j = await res.json();
  const data = j?.data;
  if (!data || j?.status !== 200) return null;

  const find = (section: string, id: string): string | null => {
    const sec = data?.[section];
    if (!sec || !Array.isArray(sec.data)) return null;
    const item = sec.data.find((d: any) => d.id === id);
    if (!item) return null;
    // Prefer hover (raw) when it parses better than value (formatted).
    return (typeof item.hover === "string" && item.hover) || (typeof item.value === "string" && item.value) || null;
  };
  const num = (section: string, id: string) => parseFmt(find(section, id));

  // stockanalysis returns debtEquity as a ratio (0.07). Yahoo convention is percent (7).
  const debtEquityRatio = num("financialPosition", "debtEquity");
  const debtToEquity = debtEquityRatio != null ? debtEquityRatio * 100 : null;

  // Use 5y revenue/eps growth forecasts as proxy for growth (TTM YoY isn't exposed cleanly).
  const revGrowth = num("analystForecasts", "revenue5y");
  const epsGrowth = num("analystForecasts", "eps5y");

  const ratingKey = ratingFromText(find("analystForecasts", "analystRatings"));

  const f: Fundamentals = {
    symbol,
    name: null,
    sector: null,
    industry: null,
    marketCap: num("valuation", "marketcap"),
    enterpriseValue: num("valuation", "enterpriseValue"),

    trailingPE: num("ratios", "pe"),
    forwardPE: num("ratios", "peForward"),
    peg: num("ratios", "pegRatio"),
    priceToSales: num("ratios", "ps"),
    priceToBook: num("ratios", "pb"),
    evToEbitda: num("evRatios", "evEbitda"),
    dividendYield: num("dividends", "dividendYield"),

    profitMargin: num("margins", "profitMargin"),
    operatingMargin: num("margins", "operatingMargin"),
    grossMargin: num("margins", "grossMargin"),
    returnOnEquity: num("financialEfficiency", "roe"),
    returnOnAssets: num("financialEfficiency", "roa"),
    returnOnInvestedCapital: num("financialEfficiency", "roic"),
    debtToEquity,
    currentRatio: num("financialPosition", "currentRatio"),
    freeCashflow: num("cashFlow", "fcf"),
    fcfMargin: num("margins", "fcfMargin"),
    altmanZ: num("scores", "zScore"),
    piotroskiF: num("scores", "fScore"),

    revenueGrowth: revGrowth,
    earningsGrowth: epsGrowth,
    beta: num("stockPrice", "beta"),
    shortPercentOfFloat: num("shortSelling", "shortFloat"),

    recommendationMean: recMeanFromKey(ratingKey),
    recommendationKey: ratingKey,
    numberOfAnalysts: num("analystForecasts", "analystCount"),
    targetMean: num("analystForecasts", "priceTarget"),
    targetMedian: null,
    targetHigh: null,
    targetLow: null,

    source: "stockanalysis",
  };
  return f;
}
