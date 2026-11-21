// Validated dark-mode palette (from the dataviz skill reference instance).
export const SERIES = [
  "#3987e5", // 1 blue
  "#d95926", // 2 orange
  "#199e70", // 3 aqua
  "#c98500", // 4 yellow
  "#d55181", // 5 magenta
  "#0ca30c", // 6 green
  "#9085e9", // 7 violet
  "#e66767", // 8 red
];

export const INK = {
  primary: "#f0efec",
  secondary: "#c3c2b7",
  muted: "#898781",
  grid: "#2c2c2a",
  axis: "#383835",
  surface: "#1a1a19",
};

// Sequential blue ramp (light -> dark) for the choropleth.
export const BLUE = [
  "#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b",
];

// map a 0..1 fraction onto the ramp (skip the two lightest so low values stay visible on dark)
export function blueScale(t: number): string {
  const ramp = BLUE.slice(1);
  const i = Math.min(ramp.length - 1, Math.max(0, Math.round(t * (ramp.length - 1))));
  return ramp[i];
}
