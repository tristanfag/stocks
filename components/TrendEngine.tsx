"use client";

import { useEffect, useState } from "react";
import { formatPct, changeClass } from "@/lib/format";
import TrendRecommendations from "./TrendRecommendations";
import PortfolioTab from "./PortfolioTab";

type ThemeHeat = any;
type Report = {
  asOf: number;
  spyReturns: { ret1m: number | null; ret3m: number | null; ret6m: number | null; ret12m: number | null };
  themes: ThemeHeat[];
  reigningMid: ThemeHeat | null;
  reigningLong: ThemeHeat | null;
  beneficiariesMid: ThemeHeat[];
  beneficiariesLong: ThemeHeat[];
};

type Props = {
  onSelectSymbol?: (symbol: string) => void;
};

type Horizon = "mid" | "long";

const HORIZON_META: Record<Horizon, {
  label: string;
  windowLabel: string;
  blurb: string;
  heatField: "heatMid" | "heatLong";
  componentsField: "componentsMid" | "componentsLong";
  reigningField: "reigningMid" | "reigningLong";
  beneficiariesField: "beneficiariesMid" | "beneficiariesLong";
  retKeys: Array<"ret1d" | "ret1m" | "ret3m" | "ret6m" | "ret12m">;
}> = {
  mid: {
    label: "Medium-term",
    windowLabel: "1–3 mo",
    blurb: "What's leading right now — the actionable rotation. Blends 1m + 3m RS vs SPY, breadth above 50d, 21d momentum z.",
    heatField: "heatMid",
    componentsField: "componentsMid",
    reigningField: "reigningMid",
    beneficiariesField: "beneficiariesMid",
    retKeys: ["ret1d", "ret1m", "ret3m"],
  },
  long: {
    label: "Long-term",
    windowLabel: "4–12 mo",
    blurb: "What's been structurally winning. Blends 6m + 12m RS vs SPY, breadth above 200d, 63d momentum z.",
    heatField: "heatLong",
    componentsField: "componentsLong",
    reigningField: "reigningLong",
    beneficiariesField: "beneficiariesLong",
    retKeys: ["ret1d", "ret6m", "ret12m"],
  },
};

type Tab = "themes" | "recommendations" | "portfolio";

export default function TrendEngine({ onSelectSymbol }: Props) {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("themes");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/api/trend", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (!cancelled) { setReport(j); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading && !report) {
    return (
      <div className="rounded-xl border border-ink-700 bg-ink-850/60 p-6 text-center text-xs text-ink-300">
        Computing trend graph (fetching ~70 tickers, ~10s)…
      </div>
    );
  }
  if (!report || !report.reigningMid) {
    return (
      <div className="rounded-xl border border-ink-700 bg-ink-850/60 p-4 text-xs text-ink-300">
        Trend engine unavailable.
      </div>
    );
  }

  const sameLeader =
    report.reigningMid && report.reigningLong &&
    report.reigningMid.id === report.reigningLong.id;

  return (
    <div className="rounded-xl border border-ember-500/40 bg-ink-850/60 p-4 backdrop-blur shadow-glow">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="h-2 w-2 animate-pulse-dot rounded-full bg-ember-500" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-100">Trend Engine</h2>

        <div className="ml-2 flex rounded-full border border-ink-700 bg-ink-900/60 p-0.5">
          <TabButton active={tab === "themes"}          onClick={() => setTab("themes")}>Themes</TabButton>
          <TabButton active={tab === "recommendations"} onClick={() => setTab("recommendations")}>Recommendations</TabButton>
          <TabButton active={tab === "portfolio"}       onClick={() => setTab("portfolio")}>Portfolio</TabButton>
        </div>

        {tab === "themes" && sameLeader && (
          <span className="rounded-full border border-ember-500/40 bg-ember-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-ember-300">
            Aligned: medium AND long horizons agree
          </span>
        )}
        <span className="ml-auto text-[10px] uppercase tracking-widest text-ink-300">
          updated {new Date(report.asOf).toLocaleTimeString()}
        </span>
      </div>

      {tab === "themes" && (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <HorizonPanel report={report} horizon="mid"  onSelectSymbol={onSelectSymbol} />
            <HorizonPanel report={report} horizon="long" onSelectSymbol={onSelectSymbol} />
          </div>
          <ParallelStrip themes={report.themes} reigningMidId={report.reigningMid?.id} reigningLongId={report.reigningLong?.id} />
        </>
      )}
      {tab === "recommendations" && <TrendRecommendations onSelectSymbol={onSelectSymbol} />}
      {tab === "portfolio"       && <PortfolioTab onSelectSymbol={onSelectSymbol} />}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-[11px] font-medium uppercase tracking-widest transition ${
        active
          ? "bg-ember-500 text-black"
          : "text-ink-200 hover:text-ink-50"
      }`}
    >
      {children}
    </button>
  );
}

function HorizonPanel({ report, horizon, onSelectSymbol }: {
  report: Report; horizon: Horizon;
  onSelectSymbol?: (s: string) => void;
}) {
  const meta = HORIZON_META[horizon];
  const reigning = (report as any)[meta.reigningField] as ThemeHeat | null;
  const beneficiaries = ((report as any)[meta.beneficiariesField] as ThemeHeat[]) || [];
  if (!reigning) return null;
  const heat = reigning[meta.heatField] as number;
  const components = reigning[meta.componentsField] as any;

  return (
    <div className="flex flex-col gap-3">
      {/* Banner */}
      <div className="rounded-lg border border-ember-500/50 bg-gradient-to-br from-ember-500/15 via-crimson-500/5 to-transparent p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-ember-300">{meta.label}</span>
              <span className="rounded border border-ember-500/30 px-1.5 text-[9px] uppercase tracking-widest text-ember-300">
                {meta.windowLabel}
              </span>
            </div>
            <h3 className="mt-1 text-xl font-bold text-ink-50">{reigning.title}</h3>
            <p className="mt-1 text-[11px] leading-snug text-ink-300">{meta.blurb}</p>
          </div>
          <HeatGauge value={heat} />
        </div>
        <p className="mt-3 text-xs leading-relaxed text-ink-100">{reigning.logic}</p>
        <ComponentBreakdown theme={reigning} components={components} retKeys={meta.retKeys} />
      </div>

      {/* Beneficiaries */}
      {beneficiaries.length > 0 && (
        <div>
          <div className="mb-1 flex items-center gap-2">
            <div className="text-[10px] uppercase tracking-widest text-ink-300">Beneficiary chain →</div>
            <div className="h-px flex-1 bg-ink-700" />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {beneficiaries.slice(0, 4).map((b) => (
              <BeneficiaryCard key={b.id} theme={b} horizon={horizon} onSelectSymbol={onSelectSymbol} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function HeatGauge({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, value));
  const color =
    v >= 70 ? "from-ember-500 to-crimson-500"
    : v >= 50 ? "from-ember-600 to-ember-400"
    : v >= 30 ? "from-ink-500 to-ink-400"
    : "from-ink-600 to-ink-500";
  return (
    <div className="text-right">
      <div className="text-[10px] uppercase tracking-widest text-ember-300">Heat</div>
      <div className="tabular text-3xl font-black text-ink-50">{value}</div>
      <div className="mt-1 h-1.5 w-24 overflow-hidden rounded-full bg-ink-700">
        <div className={`h-full rounded-full bg-gradient-to-r ${color}`} style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}

function ComponentBreakdown({ theme, components, retKeys }: {
  theme: ThemeHeat; components: any;
  retKeys: Array<"ret1d" | "ret1m" | "ret3m" | "ret6m" | "ret12m">;
}) {
  const r = theme.windowReturns;
  return (
    <div className="mt-3 grid grid-cols-3 gap-2 text-xs sm:grid-cols-6">
      <Stat label="RS vs SPY" value={`${components.rs >= 0 ? "+" : ""}${components.rs.toFixed(1)}%`} cls={changeClass(components.rs)} />
      <Stat label="Breadth"   value={`${components.breadth}%`} />
      <Stat label="Mom z"     value={components.rawZ != null ? `${components.rawZ >= 0 ? "+" : ""}${components.rawZ.toFixed(2)}σ` : "—"} />
      {retKeys.map((rk) => (
        <Stat key={rk} label={shortLabel(rk)} value={formatPct(r[rk])} cls={changeClass(r[rk])} />
      ))}
    </div>
  );
}

function shortLabel(k: "ret1d" | "ret1m" | "ret3m" | "ret6m" | "ret12m") {
  return ({ ret1d: "Today", ret1m: "1m", ret3m: "3m", ret6m: "6m", ret12m: "1y" } as const)[k];
}

function Stat({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <div className="rounded border border-ink-700 bg-ink-900/40 px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-widest text-ink-300">{label}</div>
      <div className={`tabular text-sm ${cls ?? "text-ink-50"}`}>{value}</div>
    </div>
  );
}

function BeneficiaryCard({ theme, horizon, onSelectSymbol }: {
  theme: ThemeHeat; horizon: Horizon;
  onSelectSymbol?: (s: string) => void;
}) {
  const meta = HORIZON_META[horizon];
  const heat = theme[meta.heatField] as number;
  const heatColor =
    heat >= 70 ? "border-ember-500/60 bg-ember-500/10"
    : heat >= 50 ? "border-ember-500/30 bg-ember-500/5"
    : heat >= 35 ? "border-ink-700 bg-ink-800/40"
    : "border-ink-700 bg-ink-800/20 opacity-80";
  return (
    <div className={`rounded-lg border ${heatColor} p-2.5`}>
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="text-xs font-semibold text-ink-50">{theme.title}</h4>
        <span className={`tabular text-base font-bold ${heat >= 60 ? "text-ember-300" : "text-ink-100"}`}>{heat}</span>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {theme.symbols.slice(0, 6).map((s: string) => (
          <button
            key={s}
            onClick={() => onSelectSymbol?.(s)}
            className="rounded border border-ink-600 px-1.5 py-0.5 text-[10px] text-ink-100 transition hover:border-ember-500 hover:text-ember-300"
          >{s}</button>
        ))}
      </div>
    </div>
  );
}

function ParallelStrip({ themes, reigningMidId, reigningLongId }: {
  themes: ThemeHeat[]; reigningMidId?: string; reigningLongId?: string;
}) {
  const others = themes.filter((t) => !t.parent && t.id !== reigningMidId && t.id !== reigningLongId);
  if (!others.length) return null;
  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center gap-2">
        <div className="text-[10px] uppercase tracking-widest text-ink-300">Parallel themes</div>
        <div className="h-px flex-1 bg-ink-700" />
      </div>
      <div className="flex flex-wrap gap-2">
        {others.map((t) => (
          <div key={t.id} className="flex items-center gap-2 rounded-full border border-ink-600 bg-ink-800/60 px-3 py-1">
            <span className="text-xs text-ink-100">{t.title}</span>
            <span className="tabular text-[10px] text-ink-300">M:</span>
            <span className={`tabular text-[11px] font-semibold ${t.heatMid >= 60 ? "text-ember-300" : t.heatMid >= 40 ? "text-ink-100" : "text-ink-300"}`}>
              {t.heatMid}
            </span>
            <span className="tabular text-[10px] text-ink-300">L:</span>
            <span className={`tabular text-[11px] font-semibold ${t.heatLong >= 60 ? "text-ember-300" : t.heatLong >= 40 ? "text-ink-100" : "text-ink-300"}`}>
              {t.heatLong}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
