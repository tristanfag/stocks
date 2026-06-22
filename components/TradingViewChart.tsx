"use client";

import { useEffect, useRef } from "react";
import { tvSymbol } from "@/lib/config";

type Props = { symbol: string; height?: number };

declare global {
  interface Window { TradingView?: any }
}

export default function TradingViewChart({ symbol, height = 480 }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const containerId = `tv-chart-${symbol.replace(/[^A-Z0-9]/gi, "_")}`;

  useEffect(() => {
    let widget: any;
    let cancelled = false;
    const tvSym = tvSymbol(symbol);

    const ensureScript = () =>
      new Promise<void>((resolve) => {
        if (window.TradingView) return resolve();
        const existing = document.getElementById("tv-tv-js") as HTMLScriptElement | null;
        if (existing) {
          existing.addEventListener("load", () => resolve(), { once: true });
          return;
        }
        const s = document.createElement("script");
        s.id = "tv-tv-js";
        s.src = "https://s3.tradingview.com/tv.js";
        s.async = true;
        s.onload = () => resolve();
        document.head.appendChild(s);
      });

    ensureScript().then(() => {
      if (cancelled || !containerRef.current || !window.TradingView) return;
      containerRef.current.innerHTML = "";
      const inner = document.createElement("div");
      inner.id = containerId;
      inner.style.height = "100%";
      inner.style.width = "100%";
      containerRef.current.appendChild(inner);

      widget = new window.TradingView.widget({
        autosize: true,
        symbol: tvSym,
        interval: "D",
        timezone: "Etc/UTC",
        theme: "dark",
        style: "1",
        locale: "en",
        toolbar_bg: "#000000",
        enable_publishing: false,
        hide_top_toolbar: false,
        hide_side_toolbar: false,
        hide_legend: false,
        withdateranges: true,
        allow_symbol_change: true,
        save_image: false,
        container_id: containerId,
        backgroundColor: "#000000",
        gridColor: "rgba(255,255,255,0.04)",
        studies: ["MASimple@tv-basicstudies"],
      });
    });

    return () => {
      cancelled = true;
      if (containerRef.current) containerRef.current.innerHTML = "";
    };
  }, [symbol, containerId]);

  return (
    <div
      ref={containerRef}
      style={{ height }}
      className="w-full overflow-hidden rounded-xl border border-ink-700 bg-black"
    />
  );
}
