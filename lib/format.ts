export function formatPrice(value: number | null | undefined, opts?: { compact?: boolean }) {
  if (value == null || !Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (opts?.compact && abs >= 1000) {
    return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(value);
  }
  const decimals = abs >= 100 ? 2 : abs >= 1 ? 2 : 4;
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatPct(value: number | null | undefined, signed = true) {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = signed && value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export function formatCompact(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(value);
}

export function changeClass(value: number | null | undefined) {
  if (value == null) return "text-ink-200";
  if (value > 0) return "text-gain";
  if (value < 0) return "text-loss";
  return "text-ink-200";
}
