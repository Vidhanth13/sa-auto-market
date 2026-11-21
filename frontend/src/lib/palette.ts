// Run-Track aligned dark palette - acid-green lead, cyan/violet support.
export const SERIES = [
  "#b6ff00", // 1 acid green (lead)
  "#38bdf8", // 2 cyan
  "#818cf8", // 3 violet
  "#fbbf24", // 4 amber
  "#f472b6", // 5 pink
  "#4ade80", // 6 green
  "#fb7185", // 7 red
  "#2dd4bf", // 8 teal
];

export const INK = {
  primary: "#f4f4f5",
  secondary: "#a1a1aa",
  muted: "#71717a",
  grid: "rgba(255,255,255,0.06)",
  axis: "rgba(255,255,255,0.10)",
  surface: "rgba(255,255,255,0.03)",
};

// Sequential ramp (deep teal -> acid lime) for the choropleth on a dark ground.
export const RAMP = [
  "#0b3b2e", "#0f5a3f", "#1c7d4a", "#3fa14e", "#74c73a", "#a6e92a", "#d6ff3a",
];

// map a 0..1 fraction onto the ramp
export function blueScale(t: number): string {
  const i = Math.min(RAMP.length - 1, Math.max(0, Math.round(t * (RAMP.length - 1))));
  return RAMP[i];
}
