"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type EquityPoint = { date: string; value: number; spyValue: number; allCashValue: number };
type AllocationLine = {
  date: string;
  totalValue: number;
  weights: Record<string, number>;
  classWeights: { equity: number; crypto: number; gold: number; cash: number };
  regime: { spyRiskOn: boolean | null; btcRiskOn: boolean | null; vix: number | null };
  picksDetail: Array<{ symbol: string; sharpe: number; weight: number }>;
};
type Summary = {
  startDate: string; endDate: string; startCapital: number;
  endValue: number; totalReturnPct: number; cagrPct: number;
  maxDrawdownPct: number; volAnn: number; sharpe: number;
  spyEndValue: number; spyTotalReturnPct: number; alphaVsSpyPct: number;
};
type Bucket = {
  name: string; tagline: string;
  positions: Array<{ symbol: string; weight: number; rationale: string }>;
};
type TodayPortfolio = { asOf: string; shortTerm: Bucket; mediumTerm: Bucket; longTerm: Bucket };

type Horizon = "short" | "medium" | "long" | "longWeekly" | "longWeeklySortino";
type HorizonConfig = { label: string; windowLabel: string; rankWindow: number; rebalance: "weekly" | "monthly" };
type BacktestRun = {
  horizon: Horizon;
  config: HorizonConfig;
  equityCurve: EquityPoint[];
  allocations: AllocationLine[];
  summary: Summary;
};
type Report = {
  asOf: number;
  strategy: any;
  runs: { short: BacktestRun; medium: BacktestRun; long: BacktestRun; longWeekly: BacktestRun; longWeeklySortino: BacktestRun };
  today: TodayPortfolio;
};

type Props = { onSelectSymbol?: (s: string) => void };

const CLASS_COLORS: Record<string, string> = {
  equity: "#ff5c00",
  crypto: "#a855f7",
  gold:   "#f5b301",
  cash:   "#525a64",
};

export default function PortfolioTab({ onSelectSymbol }: Props) {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [horizon, setHorizon] = useState<Horizon>("long");

  useEffect(() => { void load(false); }, []);

  async function load(force: boolean) {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`/api/portfolio${force ? "?force=1" : ""}`, { cache: "no-store" });
      const j = await r.json();
      if (j?.error) throw new Error(j.error);
      setReport(j as Report);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally { setLoading(false); }
  }

  if (loading && !report) {
    return (
      <div className="rounded-xl border border-ember-500/30 bg-ink-900/40 p-6 text-center">
        <div className="text-sm text-ink-50">Running 28-month backtest across 3 horizons…</div>
        <div className="mt-1 text-[11px] text-ink-300">Short-term (weekly rebalance), medium-term (monthly), long-term (monthly). ~30–60s on cold cache.</div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-xl border border-loss/40 bg-loss/5 p-4 text-sm text-loss">
        Backtest failed: {error}
        <button onClick={() => load(true)} className="ml-3 rounded border border-loss/40 px-2 py-0.5 text-xs hover:bg-loss/10">Retry</button>
      </div>
    );
  }
  if (!report) return null;

  const run = report.runs[horizon];

  return (
    <div className="flex flex-col gap-5">
      {/* Horizon selector */}
      <HorizonSelector
        runs={report.runs}
        active={horizon}
        onChange={setHorizon}
      />

      {/* Header + headline (uses selected run) */}
      <Header run={run} onRerun={() => load(true)} />

      {/* Stat cards */}
      <StatGrid summary={run.summary} />

      {/* Equity curve */}
      <EquityCurve equityCurve={run.equityCurve} summary={run.summary} />

      {/* Allocation over time */}
      <AllocationStrip allocations={run.allocations} />

      {/* Current allocation snapshot for the selected strategy */}
      <CurrentAllocation run={run} onSelectSymbol={onSelectSymbol} />

      {/* Today's portfolio */}
      <TodayPortfolioGrid today={report.today} onSelectSymbol={onSelectSymbol} />

      {/* Methodology */}
      <Methodology strategy={report.strategy} run={run} />
    </div>
  );
}

function HorizonSelector({ runs, active, onChange }: {
  runs: { short: BacktestRun; medium: BacktestRun; long: BacktestRun; longWeekly: BacktestRun; longWeeklySortino: BacktestRun };
  active: Horizon;
  onChange: (h: Horizon) => void;
}) {
  const order: Horizon[] = ["short", "medium", "long", "longWeekly", "longWeeklySortino"];
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
      {order.map((h) => {
        const r = runs[h];
        const isActive = h === active;
        const ret = r.summary.totalReturnPct;
        const dd = r.summary.maxDrawdownPct;
        const sh = r.summary.sharpe;
        return (
          <button
            key={h}
            onClick={() => onChange(h)}
            className={`group rounded-xl border p-4 text-left transition ${
              isActive
                ? "border-ember-500/70 bg-gradient-to-br from-ember-500/15 via-crimson-500/5 to-transparent shadow-glow"
                : "border-ink-700 bg-ink-850/40 hover:border-ember-500/40"
            }`}
          >
            <div className="flex items-baseline justify-between gap-2">
              <div>
                <div className="flex items-center gap-1.5">
                  <span className={`text-[10px] font-bold uppercase tracking-widest ${isActive ? "text-ember-300" : "text-ink-300"}`}>
                    {r.config.label}
                  </span>
                  {h === "longWeeklySortino" && (
                    <span className="rounded border border-crimson-500/50 bg-crimson-500/15 px-1 text-[8px] font-bold uppercase tracking-widest text-crimson-400">aggressive</span>
                  )}
                </div>
                <div className="text-[10px] text-ink-300">{r.config.windowLabel}</div>
              </div>
              <div className={`tabular text-2xl font-black ${ret >= 0 ? "text-gain" : "text-loss"}`}>
                {ret >= 0 ? "+" : ""}{ret.toFixed(0)}%
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-1 text-[10px]">
              <Stat label="End"     value={`$${r.summary.endValue.toLocaleString(undefined,{maximumFractionDigits:0})}`} />
              <Stat label="Sharpe"  value={sh.toFixed(2)} />
              <Stat label="Max DD"  value={`${dd.toFixed(1)}%`} cls="text-loss" />
            </div>
          </button>
        );
      })}
    </div>
  );
}

function Stat({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <div className="rounded border border-ink-700 bg-ink-900/30 px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-widest text-ink-300">{label}</div>
      <div className={`tabular text-xs ${cls ?? "text-ink-50"}`}>{value}</div>
    </div>
  );
}

// ---------------------------------------------------------------------- header
function Header({ run, onRerun }: { run: BacktestRun; onRerun: () => void }) {
  const s = run.summary;
  const positive = s.totalReturnPct >= 0;
  const yearsElapsed = (new Date(s.endDate).getTime() - new Date(s.startDate).getTime()) / (365.25 * 24 * 3600 * 1000);
  return (
    <div className="rounded-xl border border-ember-500/40 bg-gradient-to-br from-ember-500/15 via-crimson-500/5 to-transparent p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-ember-300">
            Super-portfolio · {run.config.label} backtest
          </div>
          <h3 className="mt-1 text-2xl font-bold text-ink-50">${s.startCapital.toLocaleString()} → ${s.endValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</h3>
          <div className="mt-1 text-xs text-ink-300">
            {s.startDate} → {s.endDate} · {yearsElapsed.toFixed(2)} years · {run.config.windowLabel} · {run.equityCurve.length - 1} rebalances
          </div>
        </div>
        <div className="flex items-baseline gap-3">
          <div className="text-right">
            <div className={`tabular text-3xl font-black ${positive ? "text-gain" : "text-loss"}`}>
              {positive ? "+" : ""}{s.totalReturnPct.toFixed(1)}%
            </div>
            <div className="text-[10px] uppercase tracking-widest text-ink-300">Total return</div>
          </div>
          <button
            onClick={onRerun}
            className="rounded border border-ember-500/40 bg-ember-500/10 px-3 py-1 text-[11px] uppercase tracking-widest text-ember-300 hover:bg-ember-500/20"
          >Re-run</button>
        </div>
      </div>
    </div>
  );
}

function StatGrid({ summary }: { summary: Summary }) {
  const cards: Array<{ label: string; value: string; cls?: string; sub?: string }> = [
    { label: "End value", value: `$${summary.endValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, sub: `from $${summary.startCapital.toLocaleString()}` },
    { label: "Total return", value: `${summary.totalReturnPct >= 0 ? "+" : ""}${summary.totalReturnPct.toFixed(1)}%`, cls: summary.totalReturnPct >= 0 ? "text-gain" : "text-loss" },
    { label: "CAGR", value: `${summary.cagrPct >= 0 ? "+" : ""}${summary.cagrPct.toFixed(1)}%`, cls: summary.cagrPct >= 0 ? "text-gain" : "text-loss", sub: "annualised" },
    { label: "Sharpe", value: summary.sharpe.toFixed(2), sub: "monthly returns, ann." },
    { label: "Max DD", value: `${summary.maxDrawdownPct.toFixed(1)}%`, cls: "text-loss" },
    { label: "vs SPY", value: `${summary.alphaVsSpyPct >= 0 ? "+" : ""}${summary.alphaVsSpyPct.toFixed(1)}%`, cls: summary.alphaVsSpyPct >= 0 ? "text-gain" : "text-loss", sub: `SPY: $${summary.spyEndValue.toLocaleString(undefined, { maximumFractionDigits: 0 })} (${summary.spyTotalReturnPct >= 0 ? "+" : ""}${summary.spyTotalReturnPct.toFixed(1)}%)` },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6">
      {cards.map((c) => (
        <div key={c.label} className="rounded-lg border border-ink-700 bg-ink-850/40 p-3">
          <div className="text-[10px] uppercase tracking-widest text-ink-300">{c.label}</div>
          <div className={`tabular mt-1 text-lg font-semibold ${c.cls ?? "text-ink-50"}`}>{c.value}</div>
          {c.sub && <div className="text-[10px] text-ink-300">{c.sub}</div>}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------- equity curve
function EquityCurve({ equityCurve, summary }: { equityCurve: EquityPoint[]; summary: Summary }) {
  const W = 1100, H = 320, padL = 50, padR = 20, padT = 20, padB = 30;
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (!equityCurve.length) return null;

  const xs = equityCurve.map((p) => new Date(p.date).getTime());
  const minX = xs[0], maxX = xs[xs.length - 1];
  const allValues = equityCurve.flatMap((p) => [p.value, p.spyValue, p.allCashValue]);
  const minY = Math.min(...allValues) * 0.98;
  const maxY = Math.max(...allValues) * 1.02;

  const xScale = (t: number) => padL + ((t - minX) / Math.max(1, maxX - minX)) * (W - padL - padR);
  const yScale = (v: number) => padT + (1 - (v - minY) / Math.max(1, maxY - minY)) * (H - padT - padB);

  const pathFor = (key: keyof EquityPoint) =>
    equityCurve.map((p, i) =>
      `${i === 0 ? "M" : "L"}${xScale(new Date(p.date).getTime()).toFixed(2)},${yScale(p[key] as number).toFixed(2)}`,
    ).join(" ");
  const portfolioPath = pathFor("value");
  const spyPath = pathFor("spyValue");
  const cashPath = pathFor("allCashValue");
  const fillPath = `${portfolioPath} L${xScale(maxX).toFixed(2)},${(H - padB).toFixed(2)} L${xScale(minX).toFixed(2)},${(H - padB).toFixed(2)} Z`;

  const ticks: number[] = [];
  for (let i = 0; i <= 4; i++) ticks.push(minY + (i / 4) * (maxY - minY));
  const yearMarks: { x: number; label: string }[] = [];
  const startYear = new Date(equityCurve[0].date).getUTCFullYear();
  const endYear = new Date(equityCurve.at(-1)!.date).getUTCFullYear();
  for (let y = startYear; y <= endYear; y++) {
    const ts = Date.UTC(y, 0, 1);
    if (ts >= minX && ts <= maxX) yearMarks.push({ x: xScale(ts), label: String(y) });
  }
  const quarterMarks: number[] = [];
  for (let y = startYear; y <= endYear; y++) {
    for (const m of [3, 6, 9]) {
      const ts = Date.UTC(y, m, 1);
      if (ts >= minX && ts <= maxX) quarterMarks.push(xScale(ts));
    }
  }

  function onMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    // Convert client x to viewBox x
    const xVb = ((e.clientX - rect.left) / rect.width) * W;
    if (xVb < padL || xVb > W - padR) { setHoverIdx(null); return; }
    // Find closest equity-curve index by x distance
    let bestIdx = 0, bestDx = Infinity;
    for (let i = 0; i < equityCurve.length; i++) {
      const px = xScale(new Date(equityCurve[i].date).getTime());
      const d = Math.abs(px - xVb);
      if (d < bestDx) { bestDx = d; bestIdx = i; }
    }
    setHoverIdx(bestIdx);
  }
  function onMouseLeave() { setHoverIdx(null); }

  const hover = hoverIdx != null ? equityCurve[hoverIdx] : null;
  const hoverX = hover ? xScale(new Date(hover.date).getTime()) : 0;
  const tooltipOnLeft = hover && hoverX > W * 0.6;

  return (
    <div className="rounded-xl border border-ink-700 bg-ink-850/40 p-4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-ember-300">Equity curve</div>
          <div className="text-[11px] text-ink-300">Hover for values · Strategy vs SPY buy-and-hold vs all-cash baseline</div>
        </div>
        <Legend />
      </div>
      <div className="relative overflow-hidden">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="xMidYMid meet"
          className="w-full"
          style={{ minWidth: 600 }}
          onMouseMove={onMouseMove}
          onMouseLeave={onMouseLeave}
        >
          <defs>
            <linearGradient id="portFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#ff5c00" stopOpacity="0.35" />
              <stop offset="60%"  stopColor="#ff5c00" stopOpacity="0.10" />
              <stop offset="100%" stopColor="#ff5c00" stopOpacity="0.00" />
            </linearGradient>
            <filter id="glow">
              <feGaussianBlur stdDeviation="1.5" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          {ticks.map((t, i) => (
            <g key={i}>
              <line x1={padL} y1={yScale(t)} x2={W - padR} y2={yScale(t)} stroke="#1d2025" strokeWidth="1" strokeDasharray="2,4" />
              <text x={padL - 6} y={yScale(t) + 4} textAnchor="end" fontSize="10" fill="#5a6068" fontFamily="ui-monospace, Menlo, Consolas">
                ${Math.round(t).toLocaleString()}
              </text>
            </g>
          ))}
          {quarterMarks.map((x, i) => (
            <line key={i} x1={x} y1={padT} x2={x} y2={H - padB} stroke="#15171a" strokeWidth="1" />
          ))}
          {yearMarks.map((m, i) => (
            <g key={i}>
              <line x1={m.x} y1={padT} x2={m.x} y2={H - padB} stroke="#1d2025" strokeWidth="1" />
              <text x={m.x} y={H - 10} textAnchor="middle" fontSize="10" fill="#8a9098" fontFamily="ui-monospace, Menlo, Consolas">{m.label}</text>
            </g>
          ))}

          <line x1={padL} y1={yScale(equityCurve[0].value)} x2={W - padR} y2={yScale(equityCurve[0].value)} stroke="#3a3f47" strokeWidth="1" strokeDasharray="3,3" />

          <path d={fillPath} fill="url(#portFill)" />
          <path d={cashPath} fill="none" stroke="#525a64" strokeWidth="1" strokeDasharray="2,3" />
          <path d={spyPath} fill="none" stroke="#8a9098" strokeWidth="1.6" />
          <path d={portfolioPath} fill="none" stroke="#ff5c00" strokeWidth="2.4" filter="url(#glow)" strokeLinecap="round" strokeLinejoin="round" />

          <circle cx={xScale(new Date(equityCurve.at(-1)!.date).getTime())} cy={yScale(equityCurve.at(-1)!.value)} r={5} fill="#ff5c00" />
          <circle cx={xScale(new Date(equityCurve.at(-1)!.date).getTime())} cy={yScale(equityCurve.at(-1)!.spyValue)} r={3.5} fill="#8a9098" />

          {/* Hover guide line + dots */}
          {hover && (
            <g pointerEvents="none">
              <line x1={hoverX} y1={padT} x2={hoverX} y2={H - padB} stroke="#ff5c00" strokeOpacity="0.5" strokeWidth="1" strokeDasharray="2,3" />
              <circle cx={hoverX} cy={yScale(hover.value)} r={5} fill="#ff5c00" stroke="#000" strokeWidth="1.5" />
              <circle cx={hoverX} cy={yScale(hover.spyValue)} r={4} fill="#8a9098" stroke="#000" strokeWidth="1.5" />
              <circle cx={hoverX} cy={yScale(hover.allCashValue)} r={3} fill="#525a64" stroke="#000" strokeWidth="1" />
            </g>
          )}
          {/* Invisible mouse capture rect (above grid, below points) */}
          <rect x={padL} y={padT} width={W - padL - padR} height={H - padT - padB} fill="transparent" />
        </svg>
        {hover && (
          <div
            className="pointer-events-none absolute z-10 rounded-md border border-ember-500/40 bg-black/85 px-3 py-2 backdrop-blur"
            style={{
              left: tooltipOnLeft ? undefined : `${(hoverX / W) * 100}%`,
              right: tooltipOnLeft ? `${((W - hoverX) / W) * 100}%` : undefined,
              top: 8,
              transform: tooltipOnLeft ? "translateX(-12px)" : "translateX(12px)",
              minWidth: 200,
            }}
          >
            <div className="text-[10px] uppercase tracking-widest text-ember-300">{hover.date}</div>
            <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
              <span className="text-ink-300">Strategy</span>
              <span className="tabular text-right text-ember-300 font-semibold">${hover.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
              <span className="text-ink-300">SPY</span>
              <span className="tabular text-right text-ink-100">${hover.spyValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
              <span className="text-ink-300">Cash @ 5%</span>
              <span className="tabular text-right text-ink-300">${hover.allCashValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
            </div>
            <div className="mt-1 border-t border-ink-700 pt-1 text-[10px]">
              <div className="flex justify-between">
                <span className="text-ink-300">vs start</span>
                <span className={`tabular ${(hover.value / 20000 - 1) >= 0 ? "text-gain" : "text-loss"}`}>
                  {(hover.value / 20000 - 1) >= 0 ? "+" : ""}{((hover.value / 20000 - 1) * 100).toFixed(1)}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-300">vs SPY</span>
                <span className={`tabular ${(hover.value - hover.spyValue) >= 0 ? "text-gain" : "text-loss"}`}>
                  {(hover.value - hover.spyValue) >= 0 ? "+" : ""}${(hover.value - hover.spyValue).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-[10px] uppercase tracking-widest text-ink-300">
      <span className="flex items-center gap-1.5"><span className="inline-block h-1 w-4 rounded-full bg-ember-500 shadow-glow" />Strategy</span>
      <span className="flex items-center gap-1.5"><span className="inline-block h-1 w-4 rounded-full" style={{ background: "#8a9098" }} />SPY</span>
      <span className="flex items-center gap-1.5"><span className="inline-block h-px w-4 border-t border-dashed border-ink-300" />Cash</span>
    </div>
  );
}

// ---------------------------------------------------------------------- allocation strip
function AllocationStrip({ allocations }: { allocations: AllocationLine[] }) {
  const W = 1100, H = 140, padL = 50, padR = 20, padT = 20, padB = 24;
  if (!allocations.length) return null;
  const xs = allocations.map((a) => new Date(a.date).getTime());
  const minX = xs[0], maxX = xs[xs.length - 1];
  const xScale = (t: number) => padL + ((t - minX) / Math.max(1, maxX - minX)) * (W - padL - padR);
  const innerH = H - padT - padB;

  // Build stacked area paths per asset class.
  const order: Array<keyof AllocationLine["classWeights"]> = ["equity", "crypto", "gold", "cash"];
  const stacks = order.map((cls) => {
    const top: Array<[number, number]> = [];
    for (let i = 0; i < allocations.length; i++) {
      const a = allocations[i];
      const cumBefore = order.slice(0, order.indexOf(cls)).reduce((s, k) => s + a.classWeights[k], 0);
      const cumAfter = cumBefore + a.classWeights[cls];
      const t = new Date(a.date).getTime();
      top.push([xScale(t), padT + (1 - cumAfter) * innerH]);
    }
    const bottom: Array<[number, number]> = [];
    for (let i = allocations.length - 1; i >= 0; i--) {
      const a = allocations[i];
      const cumBefore = order.slice(0, order.indexOf(cls)).reduce((s, k) => s + a.classWeights[k], 0);
      const t = new Date(a.date).getTime();
      bottom.push([xScale(t), padT + (1 - cumBefore) * innerH]);
    }
    const points = [...top, ...bottom];
    const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(" ") + " Z";
    return { cls, path };
  });

  // Year markers
  const startYear = new Date(allocations[0].date).getUTCFullYear();
  const endYear = new Date(allocations.at(-1)!.date).getUTCFullYear();
  const yearMarks: { x: number; label: string }[] = [];
  for (let y = startYear; y <= endYear; y++) {
    const ts = Date.UTC(y, 0, 1);
    if (ts >= minX && ts <= maxX) yearMarks.push({ x: xScale(ts), label: String(y) });
  }

  return (
    <div className="rounded-xl border border-ink-700 bg-ink-850/40 p-4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-ember-300">Allocation over time</div>
          <div className="text-[11px] text-ink-300">% of capital by asset class at each monthly rebalance</div>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[10px] uppercase tracking-widest text-ink-300">
          {order.map((cls) => (
            <span key={cls} className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-3 rounded-sm" style={{ background: CLASS_COLORS[cls] }} />
              {cls}
            </span>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" className="w-full" style={{ minWidth: 600 }}>
          {/* y-axis labels at 0/50/100% */}
          {[0, 0.5, 1].map((p, i) => (
            <g key={i}>
              <line x1={padL} y1={padT + (1 - p) * innerH} x2={W - padR} y2={padT + (1 - p) * innerH} stroke="#1d2025" strokeWidth="1" strokeDasharray="2,4" />
              <text x={padL - 6} y={padT + (1 - p) * innerH + 4} textAnchor="end" fontSize="10" fill="#5a6068" fontFamily="ui-monospace, Menlo, Consolas">
                {(p * 100).toFixed(0)}%
              </text>
            </g>
          ))}
          {stacks.map((s) => (
            <path key={s.cls} d={s.path} fill={CLASS_COLORS[s.cls]} fillOpacity={s.cls === "cash" ? 0.4 : 0.7} />
          ))}
          {yearMarks.map((m, i) => (
            <g key={i}>
              <line x1={m.x} y1={padT} x2={m.x} y2={H - padB} stroke="#262a30" strokeWidth="1" />
              <text x={m.x} y={H - 8} textAnchor="middle" fontSize="10" fill="#8a9098" fontFamily="ui-monospace, Menlo, Consolas">{m.label}</text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------- current allocation
function CurrentAllocation({ run, onSelectSymbol }: { run: BacktestRun; onSelectSymbol?: (s: string) => void }) {
  const last = run.allocations[run.allocations.length - 1];
  if (!last) return null;
  const totalValue = last.totalValue;
  const SYMBOL_CLASS: Record<string, string> = {
    "BTC-USD": "crypto", "ETH-USD": "crypto",
    "GLD": "gold",
    "CASH": "cash",
  };
  // Build sorted position list
  const positions = Object.entries(last.weights)
    .filter(([, w]) => w > 0.001)
    .sort((a, b) => b[1] - a[1])
    .map(([sym, w]) => ({
      symbol: sym,
      weight: w,
      dollars: w * totalValue,
      cls: (SYMBOL_CLASS[sym] || "equity") as "equity" | "crypto" | "gold" | "cash",
    }));

  const regime = last.regime;
  const regimeBadges: Array<{ label: string; bg: string }> = [];
  if (regime.spyRiskOn != null) regimeBadges.push(
    regime.spyRiskOn
      ? { label: "Risk-on (SPY > 200d)", bg: "border-gain/40 bg-gain/10 text-gain" }
      : { label: "Risk-off (SPY < 200d)", bg: "border-loss/40 bg-loss/10 text-loss" },
  );
  if (regime.btcRiskOn === true) regimeBadges.push({ label: "Crypto: ON", bg: "border-ember-500/40 bg-ember-500/10 text-ember-300" });
  if (regime.btcRiskOn === false) regimeBadges.push({ label: "Crypto: OFF", bg: "border-ink-600 bg-ink-800/60 text-ink-300" });
  if (regime.vix != null) regimeBadges.push({
    label: `VIX ${regime.vix.toFixed(1)}`,
    bg: regime.vix > 25 ? "border-loss/40 bg-loss/10 text-loss" : "border-ink-600 bg-ink-800/60 text-ink-300",
  });

  // Class totals
  const classTotals: Record<string, number> = { equity: 0, crypto: 0, gold: 0, cash: 0 };
  for (const p of positions) classTotals[p.cls] += p.weight;

  return (
    <div className="rounded-xl border border-ember-500/40 bg-gradient-to-br from-ember-500/10 via-ember-500/0 to-transparent p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-ember-300">
            Current portfolio · {run.config.label}
          </div>
          <div className="mt-0.5 text-xs text-ink-300">
            Last rebalance: <span className="text-ink-100">{last.date}</span> · marked at $
            {totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })} · {positions.length} positions
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {regimeBadges.map((b, i) => (
            <span key={i} className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest ${b.bg}`}>{b.label}</span>
          ))}
        </div>
      </div>

      {/* Class allocation bar */}
      <div className="mb-3">
        <div className="flex h-2 w-full overflow-hidden rounded-full bg-ink-800">
          {(["equity", "crypto", "gold", "cash"] as const).map((cls) => (
            classTotals[cls] > 0.001 ? (
              <div
                key={cls}
                title={`${cls} ${(classTotals[cls] * 100).toFixed(1)}%`}
                style={{ width: `${classTotals[cls] * 100}%`, background: CLASS_COLORS[cls] }}
              />
            ) : null
          ))}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-3 text-[10px] uppercase tracking-widest text-ink-300">
          {(["equity", "crypto", "gold", "cash"] as const).map((cls) => (
            classTotals[cls] > 0.001 ? (
              <span key={cls} className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-3 rounded-sm" style={{ background: CLASS_COLORS[cls] }} />
                {cls} {(classTotals[cls] * 100).toFixed(1)}%
              </span>
            ) : null
          ))}
        </div>
      </div>

      {/* Position list */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-xs">
          <thead className="text-[10px] uppercase tracking-widest text-ink-300">
            <tr>
              <th className="px-2 py-1.5 text-left">Ticker</th>
              <th className="px-2 py-1.5 text-left">Class</th>
              <th className="px-2 py-1.5 text-right">Weight</th>
              <th className="px-2 py-1.5 text-right">Dollars</th>
              <th className="px-2 py-1.5 text-left">Bar</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((p) => (
              <tr key={p.symbol} className="border-t border-ink-700">
                <td className="px-2 py-1.5">
                  <button
                    onClick={() => p.symbol !== "CASH" && onSelectSymbol?.(p.symbol)}
                    className="text-left text-sm font-semibold text-ink-50 hover:text-ember-300"
                    disabled={p.symbol === "CASH"}
                  >
                    {p.symbol}
                  </button>
                </td>
                <td className="px-2 py-1.5">
                  <span
                    className="rounded px-1.5 py-0.5 text-[9px] uppercase tracking-widest"
                    style={{ background: `${CLASS_COLORS[p.cls]}33`, color: CLASS_COLORS[p.cls] }}
                  >
                    {p.cls}
                  </span>
                </td>
                <td className="px-2 py-1.5 text-right tabular text-sm font-semibold text-ember-300">
                  {(p.weight * 100).toFixed(1)}%
                </td>
                <td className="px-2 py-1.5 text-right tabular text-ink-100">
                  ${p.dollars.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </td>
                <td className="px-2 py-1.5 w-1/3">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-800">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${p.weight * 100}%`, background: CLASS_COLORS[p.cls] }}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------- today's portfolio
function TodayPortfolioGrid({ today, onSelectSymbol }: { today: TodayPortfolio; onSelectSymbol?: (s: string) => void }) {
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-ember-300">Today's preferred portfolio</div>
          <div className="text-[11px] text-ink-300">Three horizons. Same selection rules used in the backtest, applied to today's data.</div>
        </div>
        <span className="text-[10px] uppercase tracking-widest text-ink-300">as of {today.asOf}</span>
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <BucketCard b={today.shortTerm} onSelectSymbol={onSelectSymbol} accent="from-crimson-500/20" />
        <BucketCard b={today.mediumTerm} onSelectSymbol={onSelectSymbol} accent="from-ember-500/20" />
        <BucketCard b={today.longTerm} onSelectSymbol={onSelectSymbol} accent="from-emerald-500/20" />
      </div>
    </div>
  );
}
function BucketCard({ b, onSelectSymbol, accent }: { b: Bucket; onSelectSymbol?: (s: string) => void; accent: string }) {
  return (
    <div className={`rounded-lg border border-ember-500/30 bg-gradient-to-br ${accent} via-ember-500/0 to-transparent p-4`}>
      <div className="text-sm font-bold text-ink-50">{b.name}</div>
      <div className="text-[11px] text-ink-300">{b.tagline}</div>
      <div className="mt-3 flex flex-col gap-1.5">
        {b.positions.length === 0 && <div className="text-xs text-ink-300">No tickers passed the filters.</div>}
        {b.positions.map((p) => (
          <button
            key={p.symbol}
            onClick={() => onSelectSymbol?.(p.symbol)}
            className="flex w-full items-center justify-between rounded-md border border-ink-700 bg-ink-900/40 px-3 py-2 text-left transition hover:border-ember-500/50"
          >
            <div className="min-w-0">
              <div className="text-sm font-semibold text-ink-50">{p.symbol}</div>
              <div className="truncate text-[10px] text-ink-300">{p.rationale}</div>
            </div>
            <div className="ml-3 text-right">
              <div className="tabular text-sm font-semibold text-ember-300">{(p.weight * 100).toFixed(1)}%</div>
              <div className="text-[10px] uppercase tracking-widest text-ink-300">weight</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------- methodology
function Methodology({ strategy, run }: { strategy: any; run: BacktestRun }) {
  const rankerLabel =
    strategy.ranker === "blended" ? `blended Sharpe + Sortino + Omega percentile rank over trailing ${run.config.rankWindow} trading days`
    : strategy.ranker === "sharpe" ? `trailing-${run.config.rankWindow}d Sharpe`
    : strategy.ranker === "sortino" ? `trailing-${run.config.rankWindow}d Sortino`
    : `trailing-${run.config.rankWindow}d Omega`;
  const weightingLabel =
    strategy.weighting === "invvol"
      ? `inverse-volatility (risk parity over ${strategy.volWindow}d window) — bigger position in lower-vol names so each contributes equal risk`
      : strategy.weighting === "score"
      ? "score-weighted — weights proportional to ranking score"
      : "equal-weight (1/N)";

  const lines = [
    `Active horizon: ${run.config.label} (${run.config.windowLabel}). Switch tabs at the top to compare.`,
    "Strategy is rule-based — same logic applied identically to historical and current data, no hindsight cherry-picking.",
    `Rebalance cadence: ${run.config.rebalance === "weekly" ? "weekly (every Monday)" : "monthly (1st of each month)"}. Daily rebalancing is anti-pattern: spreads + whipsaw + tax drag. Watch the dashboard daily for regime breaks (30d Sharpe z flips); rebalance early only on those.`,
    `Risk regime: SPY > 200d SMA → cash ${(strategy.cashWeightRiskOn * 100).toFixed(0)}%, else ${(strategy.cashWeightRiskOff * 100).toFixed(0)}%.`,
    `Crypto sleeve: BTC > 200d SMA AND 3m return > 0 → ${(strategy.cryptoWeightOn * 100).toFixed(0)}% (split BTC ${(strategy.cryptoSplit.btc * 100).toFixed(0)} / ETH ${(strategy.cryptoSplit.eth * 100).toFixed(0)}).`,
    `Gold sleeve: ${(strategy.goldWeightBase * 100).toFixed(0)}% baseline, ${(strategy.goldWeightDefensive * 100).toFixed(0)}% when VIX > ${strategy.vixDefensiveThreshold}.`,
    `Equity sleeve: top ${strategy.equityTopN} from trend-graph universe ranked by ${rankerLabel}, must be above 200d SMA.`,
    `Equity weighting: ${weightingLabel}. Position cap: max ${(strategy.weightCap * 100).toFixed(0)}% of the equity sleeve in any single name (excess redistributed).`,
    `Cash earns ~${(strategy.cashAnnualYield * 100).toFixed(0)}% APY (Fed funds proxy).`,
    "Why blended ranker: Sharpe penalises upside vol you actually want; Sortino fixes that but ignores tail shape; Omega captures full distribution but is threshold-sensitive. Averaging percentile ranks across the three is more robust than any single metric.",
    "Why inverse-vol weighting: equal-weight gives the highest-vol name (e.g. NVDA) the same risk budget as a steady compounder. Inverse-vol normalises that — each name contributes ~equal risk to the portfolio. Industry standard for systematic multi-asset strategies.",
    "Past performance is descriptive, not predictive. Frictions (fees, slippage, taxes) are NOT modelled — real-world results would be lower.",
  ];
  return (
    <details className="rounded-lg border border-ink-700 bg-ink-850/40 p-3 text-xs">
      <summary className="cursor-pointer text-[10px] uppercase tracking-widest text-ink-300">Methodology · how the portfolio is constructed</summary>
      <ul className="mt-2 space-y-1 text-ink-100">
        {lines.map((l, i) => <li key={i}>• {l}</li>)}
      </ul>
    </details>
  );
}
