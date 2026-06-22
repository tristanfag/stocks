"use client";

import { useEffect, useState } from "react";
import { formatPct, formatPrice, formatCompact, changeClass } from "@/lib/format";

type Insight = any; // shape matches lib/insight.ts; kept loose on the client.

type Props = { symbol: string };

// --- helpers (defined before the component to play nicely with Fast Refresh) ---
function fmtZ(v: number | null | undefined) {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}σ`;
}
function zClass(v: number | null | undefined) {
  if (v == null) return "text-ink-50";
  if (v >= 1.8) return "text-loss";
  if (v <= -1.8) return "text-gain";
  return "text-ink-50";
}
function rsiClass(v: number | null | undefined) {
  if (v == null) return "text-ink-50";
  if (v >= 70) return "text-loss";
  if (v <= 30) return "text-gain";
  return "text-ink-50";
}
function pctOrDash(v: number | null | undefined) {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${(v * 100).toFixed(1)}%`;
}
function niceRec(k: string) {
  const map: Record<string, string> = {
    strong_buy: "Strong Buy", buy: "Buy", hold: "Hold",
    underperform: "Underperform", sell: "Sell", none: "—",
  };
  return map[k] ?? k;
}
function recClass(mean: number | null | undefined) {
  if (mean == null) return "text-ink-50";
  if (mean <= 1.7) return "text-gain";
  if (mean <= 2.5) return "text-emerald-300";
  if (mean <= 3.3) return "text-ink-100";
  return "text-loss";
}
function altmanCls(z: number | null | undefined) {
  if (z == null) return "text-ink-50";
  // stockanalysis.com's "zScore" is a 0..100 health proxy (higher = healthier), not classic Altman Z.
  if (z >= 60) return "text-gain";
  if (z >= 30) return "text-ink-100";
  return "text-loss";
}
function piotroskiCls(f: number | null | undefined) {
  if (f == null) return "text-ink-50";
  if (f >= 7) return "text-gain";
  if (f >= 5) return "text-ink-100";
  return "text-loss";
}
function ratioCls(v: number | null | undefined, t: { good: number; mid: number }) {
  if (v == null) return "text-ink-50";
  if (v >= t.good) return "text-gain";
  if (v >= t.mid)  return "text-emerald-300";
  if (v >= 0)      return "text-ink-100";
  return "text-loss";
}
function regimeZCls(z: number | null | undefined) {
  if (z == null || !Number.isFinite(z)) return "text-ink-300";
  if (z >= 2.0)  return "text-gain font-bold";
  if (z >= 1.0)  return "text-emerald-300";
  if (z >= -1.0) return "text-ink-100";
  if (z >= -2.0) return "text-crimson-400";
  return "text-loss font-bold";
}
function regimeBgCls(z: number | null | undefined) {
  if (z == null || !Number.isFinite(z)) return "bg-ink-800/40 border-ink-700";
  if (z >= 2.0)  return "bg-gain/10 border-gain/40";
  if (z >= 1.0)  return "bg-gain/5 border-gain/20";
  if (z >= -1.0) return "bg-ink-800/40 border-ink-700";
  if (z >= -2.0) return "bg-loss/5 border-loss/20";
  return "bg-loss/10 border-loss/40";
}

const REGIME_WINDOW_LABELS: Record<string, string> = {
  d30: "30d", d90: "90d", d180: "180d", d365: "1y",
};

function fmtRatio(v: number | null | undefined) {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toFixed(2);
}

type RegimeCell = { value: number | null; z: number | null; samples: number };
type RegimeData = {
  historyDays: number;
  windows: Array<"d30" | "d90" | "d180" | "d365">;
  sharpe:  Record<string, RegimeCell>;
  sortino: Record<string, RegimeCell>;
  omega:   Record<string, RegimeCell>;
};

function RegimeMatrix({ reg }: { reg: RegimeData }) {
  const windows = reg.windows;
  const rows: { label: string; key: "sharpe" | "sortino" | "omega"; tooltip: string }[] = [
    { label: "Sharpe",  key: "sharpe",  tooltip: "Risk-adjusted excess return per unit of total volatility." },
    { label: "Sortino", key: "sortino", tooltip: "Same as Sharpe but penalizes only downside volatility." },
    { label: "Omega",   key: "omega",   tooltip: "Σ gains / Σ losses across the window — full distribution shape." },
  ];

  return (
    <div className="rounded-lg border border-ember-500/40 bg-gradient-to-br from-ember-500/10 via-ember-500/0 to-transparent p-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-ember-300">
            Regime z-score matrix
          </div>
          <div className="text-[10px] text-ink-300">
            Current ratio vs this ticker's own rolling distribution over {reg.historyDays} days of history. |z|≥2 = top/bottom 2.5%.
          </div>
        </div>
        <div className="flex items-center gap-2 text-[9px] uppercase tracking-widest text-ink-300">
          <span className="inline-block h-2 w-2 rounded-full bg-gain" /> z≥+2 hot
          <span className="inline-block h-2 w-2 rounded-full bg-loss" /> z≤−2 cold
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-xs">
          <thead>
            <tr className="text-[10px] uppercase tracking-widest text-ink-300">
              <th className="px-2 py-1 text-left font-medium">Ratio</th>
              {windows.map((w) => (
                <th key={w} className="px-2 py-1 text-center font-medium">{REGIME_WINDOW_LABELS[w] ?? w}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const buckets = (reg as any)[r.key] as Record<string, RegimeCell>;
              return (
                <tr key={r.key} className="border-t border-ink-700">
                  <td className="px-2 py-1.5 align-top" title={r.tooltip}>
                    <div className="text-sm font-semibold text-ink-50">{r.label}</div>
                  </td>
                  {windows.map((w) => {
                    const cell = buckets?.[w];
                    return (
                      <td key={w} className="px-1 py-1">
                        <div className={`flex flex-col items-center gap-0.5 rounded-md border px-2 py-1.5 ${regimeBgCls(cell?.z)}`}>
                          <div className="tabular text-sm text-ink-50">{fmtRatio(cell?.value)}</div>
                          <div className={`tabular text-[11px] ${regimeZCls(cell?.z)}`}>{fmtZ(cell?.z)}</div>
                          <div className="text-[9px] uppercase tracking-widest text-ink-300">n={cell?.samples ?? 0}</div>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function InsightPanel({ symbol }: Props) {
  const [data, setData] = useState<Insight | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/insight/${encodeURIComponent(symbol)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (!cancelled) { setData(j); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [symbol]);

  if (loading && !data) return <Skeleton />;
  if (!data || data.error) return <div className="rounded-xl border border-ink-700 bg-ink-850/60 p-4 text-xs text-ink-300">No insight data.</div>;

  const s = data.scores;
  const z = data.zscores;
  const sig = data.signals;
  const st = data.stats;
  const ex = data.expected;
  const f = data.fundamentals;
  const reg = data.regime;

  return (
    <div className="flex flex-col gap-3">
      {/* Composite scores */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <ScoreBar label="Value"    value={s?.value} />
        <ScoreBar label="Quality"  value={s?.quality} />
        <ScoreBar label="Momentum" value={s?.momentum} />
        <ScoreBar label="Trend"    value={s?.trend} />
        <ScoreBar label="Edge"     value={s?.edge} highlight />
      </div>

      {/* Notes / observations */}
      {Array.isArray(s?.notes) && s.notes.length > 0 && (
        <div className="rounded-lg border border-ember-500/30 bg-ember-500/5 px-3 py-2">
          <div className="mb-1 text-[10px] uppercase tracking-widest text-ember-300">Observations</div>
          <ul className="space-y-1">
            {s.notes.map((n: string, i: number) => (
              <li key={i} className="text-xs leading-snug text-ink-100">• {n}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Regime z-score matrix — current ratios vs ticker's own 5y distribution */}
      {reg && <RegimeMatrix reg={reg} />}

      {/* Stats / Z-scores / Trend / Expected */}
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
        <Card title="Returns & Risk">
          <Row k="Today" v={formatPct(st?.ret1d)} cls={changeClass(st?.ret1d)} />
          <Row k="1m"   v={formatPct(st?.ret1m)} cls={changeClass(st?.ret1m)} />
          <Row k="3m"   v={formatPct(st?.ret3m)} cls={changeClass(st?.ret3m)} />
          <Row k="6m"   v={formatPct(st?.ret6m)} cls={changeClass(st?.ret6m)} />
          <Row k="1y"   v={formatPct(st?.ret1y)} cls={changeClass(st?.ret1y)} />
          <Sep />
          <Row k="Vol (ann)" v={st?.volAnn != null ? `${st.volAnn.toFixed(1)}%` : "—"} />
          <Row k="Sharpe"    v={st?.sharpe  != null ? st.sharpe.toFixed(2)  : "—"} cls={ratioCls(st?.sharpe,  { good: 1.5, mid: 0.5 })} />
          <Row k="Sortino"   v={st?.sortino != null ? st.sortino.toFixed(2) : "—"} cls={ratioCls(st?.sortino, { good: 2.0, mid: 0.7 })} />
          <Row k="Omega(0)"  v={st?.omega   != null ? st.omega.toFixed(2)   : "—"} cls={ratioCls(st?.omega,   { good: 1.4, mid: 1.0 })} />
          <Row k="Max DD"    v={st?.maxDrawdown != null ? `${st.maxDrawdown.toFixed(1)}%` : "—"} cls="text-loss" />
          <Row k="β vs SPY"  v={st?.beta != null ? st.beta.toFixed(2) : "—"} />
        </Card>

        <Card title="Z-scores & Levels">
          <Row k="z (50d)"  v={fmtZ(z?.priceVs50)}  cls={zClass(z?.priceVs50)} />
          <Row k="z (200d)" v={fmtZ(z?.priceVs200)} cls={zClass(z?.priceVs200)} />
          <Row k="RSI(14)"  v={sig?.rsi14 != null ? sig.rsi14.toFixed(1) : "—"} cls={rsiClass(sig?.rsi14)} />
          <Row k="BB %B"    v={sig?.bbPctB != null ? (sig.bbPctB * 100).toFixed(0) + "%" : "—"} />
          <Sep />
          <Row k="vs 52w high" v={z?.distFrom52wHighPct != null ? `${z.distFrom52wHighPct.toFixed(1)}%` : "—"} cls={changeClass(z?.distFrom52wHighPct)} />
          <Row k="vs 52w low"  v={z?.distFrom52wLowPct  != null ? `+${z.distFrom52wLowPct.toFixed(1)}%`  : "—"} cls="text-gain" />
          <Row k="ρ vs SPY"    v={st?.corrSPY != null ? st.corrSPY.toFixed(2) : "—"} />
        </Card>

        <Card title="Trend Signals">
          <Row k="vs SMA50"  v={sig?.priceVsSma50Pct  != null ? `${sig.priceVsSma50Pct.toFixed(1)}%`  : "—"} cls={changeClass(sig?.priceVsSma50Pct)} />
          <Row k="vs SMA200" v={sig?.priceVsSma200Pct != null ? `${sig.priceVsSma200Pct.toFixed(1)}%` : "—"} cls={changeClass(sig?.priceVsSma200Pct)} />
          <Row k="MACD hist" v={sig?.macdHist != null ? sig.macdHist.toFixed(2) : "—"} cls={changeClass(sig?.macdHist)} />
          <Row k="Cross"     v={sig?.goldenCross == null ? "—" : sig.goldenCross ? "Golden" : "Death"} cls={sig?.goldenCross ? "text-gain" : sig?.deathCross ? "text-loss" : ""} />
          <Sep />
          <Row k="SMA20"  v={formatPrice(sig?.sma20)} />
          <Row k="SMA50"  v={formatPrice(sig?.sma50)} />
          <Row k="SMA200" v={formatPrice(sig?.sma200)} />
        </Card>

        <Card title="Expected & Targets" highlight>
          <Row
            k="Implied 1m range"
            v={ex?.range1mLowPct != null
              ? `${ex.range1mLowPct.toFixed(1)}% / +${ex.range1mHighPct.toFixed(1)}%`
              : "—"}
          />
          <Row
            k="Mean-rev (30d)"
            v={ex?.meanReversion30dPct != null ? `${ex.meanReversion30dPct >= 0 ? "+" : ""}${ex.meanReversion30dPct.toFixed(1)}%` : "—"}
            cls={changeClass(ex?.meanReversion30dPct)}
          />
          <Sep />
          <Row k="Analyst tgt" v={f?.targetMean != null ? `$${f.targetMean.toFixed(2)}` : "—"} />
          <Row
            k="Implied upside"
            v={ex?.analystUpsidePct != null ? `${ex.analystUpsidePct >= 0 ? "+" : ""}${ex.analystUpsidePct.toFixed(1)}%` : "—"}
            cls={changeClass(ex?.analystUpsidePct)}
          />
          <Row k="Tgt range" v={f?.targetLow != null && f?.targetHigh != null ? `$${f.targetLow.toFixed(0)} – $${f.targetHigh.toFixed(0)}` : "—"} />
          <Row k="Analysts" v={f?.numberOfAnalysts != null ? `${f.numberOfAnalysts}` : "—"} />
          <Row k="Rating"    v={f?.recommendationKey ? niceRec(f.recommendationKey) : "—"} cls={recClass(f?.recommendationMean)} />
        </Card>
      </div>

      {/* Valuation + Quality + Profile */}
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        <Card title="Valuation">
          <Row k="P/E (ttm)" v={f?.trailingPE != null ? f.trailingPE.toFixed(1) : "—"} />
          <Row k="P/E (fwd)" v={f?.forwardPE != null ? f.forwardPE.toFixed(1) : "—"} />
          <Row k="PEG"        v={f?.peg != null ? f.peg.toFixed(2) : "—"} />
          <Row k="P/S"        v={f?.priceToSales != null ? f.priceToSales.toFixed(2) : "—"} />
          <Row k="P/B"        v={f?.priceToBook != null ? f.priceToBook.toFixed(2) : "—"} />
          <Row k="EV/EBITDA"  v={f?.evToEbitda != null ? f.evToEbitda.toFixed(1) : "—"} />
          <Row k="Div yield"  v={f?.dividendYield != null ? `${(f.dividendYield * 100).toFixed(2)}%` : "—"} />
        </Card>

        <Card title="Quality">
          <Row k="ROE"          v={pctOrDash(f?.returnOnEquity)} />
          <Row k="ROIC"         v={pctOrDash(f?.returnOnInvestedCapital)} />
          <Row k="Op margin"    v={pctOrDash(f?.operatingMargin)} />
          <Row k="Net margin"   v={pctOrDash(f?.profitMargin)} />
          <Row k="Gross margin" v={pctOrDash(f?.grossMargin)} />
          <Row k="FCF margin"   v={pctOrDash(f?.fcfMargin)} />
          <Row k="Rev growth"   v={pctOrDash(f?.revenueGrowth)} cls={changeClass(f?.revenueGrowth)} />
          <Row k="Debt/Equity"  v={f?.debtToEquity != null ? f.debtToEquity.toFixed(0) : "—"} />
          <Row k="FCF"          v={formatCompact(f?.freeCashflow)} />
          <Sep />
          <Row k="Altman Z"     v={f?.altmanZ != null ? f.altmanZ.toFixed(1) : "—"} cls={altmanCls(f?.altmanZ)} />
          <Row k="Piotroski F"  v={f?.piotroskiF != null ? `${f.piotroskiF}/9` : "—"} cls={piotroskiCls(f?.piotroskiF)} />
        </Card>

        <Card title="Profile">
          <Row k="Sector"      v={f?.sector || "—"} />
          <Row k="Industry"    v={f?.industry || "—"} />
          <Row k="Market cap"  v={formatCompact(f?.marketCap)} />
          <Row k="Ent. value"  v={formatCompact(f?.enterpriseValue)} />
          <Row k="Beta (5y)"   v={f?.beta != null ? f.beta.toFixed(2) : "—"} />
          <Row k="Short %"     v={f?.shortPercentOfFloat != null ? `${(f.shortPercentOfFloat * 100).toFixed(1)}%` : "—"} />
        </Card>
      </div>
    </div>
  );
}

function ScoreBar({ label, value, highlight }: { label: string; value: number | null | undefined; highlight?: boolean }) {
  const v = typeof value === "number" ? value : null;
  const pct = v == null ? 0 : Math.max(0, Math.min(100, v));
  const color =
    v == null ? "bg-ink-500"
    : v >= 70 ? "bg-gradient-to-r from-emerald-500 to-emerald-300"
    : v >= 40 ? "bg-gradient-to-r from-ember-600 to-ember-400"
    : "bg-gradient-to-r from-crimson-600 to-crimson-400";
  return (
    <div className={`rounded-lg border ${highlight ? "border-ember-500/60 bg-ember-500/5" : "border-ink-700 bg-ink-850/60"} p-3`}>
      <div className="flex items-baseline justify-between">
        <div className={`text-[10px] uppercase tracking-widest ${highlight ? "text-ember-300" : "text-ink-300"}`}>{label}</div>
        <div className={`tabular text-lg font-semibold ${highlight ? "text-ember-300" : "text-ink-50"}`}>{v != null ? v : "—"}</div>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-ink-700">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Card({ title, children, highlight }: { title: string; children: React.ReactNode; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border ${highlight ? "border-ember-500/40 bg-ember-500/5" : "border-ink-700 bg-ink-800/40"} p-3`}>
      <div className={`mb-2 text-[10px] font-semibold uppercase tracking-widest ${highlight ? "text-ember-300" : "text-ink-300"}`}>{title}</div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}
function Row({ k, v, cls }: { k: string; v: string | number; cls?: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-ink-300">{k}</span>
      <span className={`tabular ${cls ?? "text-ink-50"}`}>{v}</span>
    </div>
  );
}
function Sep() { return <div className="my-1 h-px w-full bg-ink-700" />; }

function Skeleton() {
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-850/60 p-4 text-xs text-ink-300">
      Computing insight…
    </div>
  );
}
