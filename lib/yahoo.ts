import yahooFinance from "yahoo-finance2";

yahooFinance.suppressNotices(["yahooSurvey"]);
yahooFinance.setGlobalConfig({ validation: { logErrors: false, logOptionsErrors: false } });

export type Quote = {
  symbol: string;
  name: string;
  price: number | null;
  prevClose: number | null;
  change: number | null;
  changePct: number | null;
  marketState: string | null;
  currency: string | null;
  dayLow: number | null;
  dayHigh: number | null;
  yearLow: number | null;
  yearHigh: number | null;
  marketCap: number | null;
  volume: number | null;
};

export type Candle = { t: number; c: number };

const cache = new Map<string, { ts: number; data: unknown }>();
const QUOTE_TTL = 30_000;
const HIST_TTL = 5 * 60_000;
const NEWS_TTL = 5 * 60_000;

function cacheGet<T>(key: string, ttl: number): T | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts > ttl) { cache.delete(key); return null; }
  return hit.data as T;
}
function cacheSet<T>(key: string, data: T) {
  cache.set(key, { ts: Date.now(), data });
}

const inflight = new Map<string, Promise<any>>();
function dedupe<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const p = fn().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

const FRIENDLY_NAMES: Record<string, string> = {
  "^GSPC": "S&P 500", "^NDX": "Nasdaq 100", "^DJI": "Dow Jones", "^VIX": "VIX",
  "DX-Y.NYB": "US Dollar Index", "CL=F": "Crude Oil", "GC=F": "Gold",
  "BTC-USD": "Bitcoin", "ETH-USD": "Ethereum", "SOL-USD": "Solana",
  "SPY": "SPDR S&P 500 ETF", "QQQ": "Invesco QQQ Trust",
};

async function fetchChart(symbol: string, range: string, interval: string): Promise<any | null> {
  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
  url.searchParams.set("range", range);
  url.searchParams.set("interval", interval);
  url.searchParams.set("includePrePost", "false");
  url.searchParams.set("events", "div,splits");

  try {
    const res = await fetch(url.toString(), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "application/json,text/javascript,*/*",
      },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("json")) return null;
    const j = await res.json();
    return j?.chart?.result?.[0] ?? null;
  } catch {
    return null;
  }
}

function quoteFromChart(symbol: string, result: any): Quote {
  const meta = result?.meta ?? {};
  const price = typeof meta.regularMarketPrice === "number" ? meta.regularMarketPrice : null;
  const prev = typeof meta.chartPreviousClose === "number"
    ? meta.chartPreviousClose
    : (typeof meta.previousClose === "number" ? meta.previousClose : null);
  const change = price != null && prev != null ? price - prev : null;
  const changePct = price != null && prev != null && prev !== 0 ? ((price - prev) / prev) * 100 : null;
  return {
    symbol,
    name: FRIENDLY_NAMES[symbol] || meta.shortName || meta.longName || symbol,
    price,
    prevClose: prev,
    change,
    changePct,
    marketState: meta.marketState ?? null,
    currency: meta.currency ?? null,
    dayLow: typeof meta.regularMarketDayLow === "number" ? meta.regularMarketDayLow : null,
    dayHigh: typeof meta.regularMarketDayHigh === "number" ? meta.regularMarketDayHigh : null,
    yearLow: typeof meta.fiftyTwoWeekLow === "number" ? meta.fiftyTwoWeekLow : null,
    yearHigh: typeof meta.fiftyTwoWeekHigh === "number" ? meta.fiftyTwoWeekHigh : null,
    marketCap: null,
    volume: typeof meta.regularMarketVolume === "number" ? meta.regularMarketVolume : null,
  };
}

function candlesFromChart(result: any): Candle[] {
  const ts: number[] = result?.timestamp ?? [];
  const closes: (number | null)[] = result?.indicators?.quote?.[0]?.close ?? [];
  const out: Candle[] = [];
  for (let i = 0; i < ts.length; i++) {
    const c = closes[i];
    if (c != null && Number.isFinite(c)) out.push({ t: ts[i] * 1000, c });
  }
  return out;
}

export async function getQuotes(symbols: string[]): Promise<Quote[]> {
  if (!symbols.length) return [];
  const results = await Promise.all(
    symbols.map(async (s) => {
      const key = `q:${s}`;
      const cached = cacheGet<Quote>(key, QUOTE_TTL);
      if (cached) return cached;
      return dedupe(key, async () => {
        const r = await fetchChart(s, "5d", "1d");
        if (!r) {
          const fallback: Quote = {
            symbol: s, name: FRIENDLY_NAMES[s] || s, price: null, prevClose: null,
            change: null, changePct: null, marketState: null, currency: null,
            dayLow: null, dayHigh: null, yearLow: null, yearHigh: null, marketCap: null, volume: null,
          };
          return fallback;
        }
        const q = quoteFromChart(s, r);
        cacheSet(key, q);
        return q;
      });
    }),
  );
  return results;
}

export type HistoryRange = "1d" | "5d" | "1mo" | "3mo" | "6mo" | "1y" | "2y" | "5y" | "10y";

export async function getHistory(
  symbol: string,
  range: HistoryRange = "1mo",
): Promise<Candle[]> {
  const key = `h:${symbol}:${range}`;
  const cached = cacheGet<Candle[]>(key, HIST_TTL);
  if (cached) return cached;
  return dedupe(key, async () => {
    const interval = range === "1d" ? "5m" : range === "5d" ? "30m" : "1d";
    const r = await fetchChart(symbol, range, interval);
    if (!r) return [];
    const candles = candlesFromChart(r);
    cacheSet(key, candles);
    return candles;
  });
}

export type NewsItem = {
  uuid: string;
  title: string;
  publisher: string;
  link: string;
  publishedAt: number;
  relatedTickers: string[];
};

function decodeEntities(s: string) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

function pickTag(block: string, tag: string): string | null {
  const cdata = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, "i").exec(block);
  if (cdata) return cdata[1];
  const plain = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i").exec(block);
  return plain ? decodeEntities(plain[1]).trim() : null;
}

async function fetchRssFor(symbol: string, perSymbol: number): Promise<NewsItem[]> {
  const url = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(symbol)}&region=US&lang=en-US`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "application/rss+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const items: NewsItem[] = [];
    const itemRe = /<item>([\s\S]*?)<\/item>/g;
    let m: RegExpExecArray | null;
    while ((m = itemRe.exec(xml)) && items.length < perSymbol) {
      const block = m[1];
      const title = pickTag(block, "title");
      const link = pickTag(block, "link");
      const pubDate = pickTag(block, "pubDate");
      const guid = pickTag(block, "guid");
      if (!title || !link) continue;
      const published = pubDate ? new Date(pubDate).getTime() : Date.now();
      items.push({
        uuid: guid || link,
        title,
        publisher: "Yahoo Finance",
        link,
        publishedAt: Number.isFinite(published) ? published : Date.now(),
        relatedTickers: [symbol],
      });
    }
    return items;
  } catch {
    return [];
  }
}

export async function getNewsForSymbols(symbols: string[], perSymbol = 4): Promise<NewsItem[]> {
  const key = `n:${symbols.slice().sort().join(",")}:${perSymbol}`;
  const cached = cacheGet<NewsItem[]>(key, NEWS_TTL);
  if (cached) return cached;

  const buckets = await Promise.all(symbols.map((s) => fetchRssFor(s, perSymbol)));
  const all = buckets.flat();

  const seen = new Set<string>();
  const deduped = all.filter((n) => {
    const k = n.uuid || n.link;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  deduped.sort((a, b) => b.publishedAt - a.publishedAt);
  cacheSet(key, deduped);
  return deduped;
}
