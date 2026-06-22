"use client";

import { useEffect, useState } from "react";

type Props = {
  symbol: string;
  width?: number;
  height?: number;
  positive?: boolean | null;
};

export default function Sparkline({ symbol, width = 96, height = 28, positive }: Props) {
  const [points, setPoints] = useState<number[] | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setPoints(null);
    setErr(false);
    fetch(`/api/history?symbol=${encodeURIComponent(symbol)}&range=1mo`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        const candles = (j?.candles ?? []) as { c: number }[];
        if (!candles.length) { setErr(true); return; }
        setPoints(candles.map((c) => c.c));
      })
      .catch(() => { if (!cancelled) setErr(true); });
    return () => { cancelled = true; };
  }, [symbol]);

  if (err || !points || points.length < 2) {
    return <div style={{ width, height }} className="opacity-30">─</div>;
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = Math.max(1e-9, max - min);
  const stepX = width / (points.length - 1);

  const path = points
    .map((p, i) => {
      const x = i * stepX;
      const y = height - ((p - min) / range) * height;
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  const isUp = positive ?? points[points.length - 1] >= points[0];
  const stroke = isUp ? "#22c55e" : "#ef3a2b";
  const fill = isUp ? "rgba(34,197,94,0.12)" : "rgba(239,58,43,0.12)";
  const areaPath = `${path} L${width.toFixed(2)},${height} L0,${height} Z`;

  return (
    <svg width={width} height={height} className="block">
      <path d={areaPath} fill={fill} />
      <path d={path} fill="none" stroke={stroke} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
