export type ColormapName = 'gebco' | 'coolwarm' | 'viridis' | 'turbo';

interface ColorStop {
  pos: number; // 0.0 to 1.0
  r: number;
  g: number;
  b: number;
}

const COLORMAPS: Record<ColormapName, ColorStop[]> = {
  gebco: [
    { pos: 0.0, r: 8, g: 29, b: 88 },       // Deepest Ocean Trench (Deep Navy)
    { pos: 0.25, r: 37, g: 52, b: 148 },   // Abyssal Plain (Royal Blue)
    { pos: 0.45, r: 65, g: 182, b: 196 },  // Continental Shelf (Cyan)
    { pos: 0.5, r: 237, g: 248, b: 177 },  // Coastline / Shore (Pale Yellow)
    { pos: 0.65, r: 65, g: 171, b: 93 },   // Lowland (Green)
    { pos: 0.85, r: 217, g: 95, b: 14 },   // Highlands (Brown/Orange)
    { pos: 1.0, r: 255, g: 255, b: 255 },  // Mountain Peaks (Snow White)
  ],
  coolwarm: [
    { pos: 0.0, r: 59, g: 76, b: 192 },    // Strong Negative Anomaly (Deep Blue)
    { pos: 0.25, r: 139, g: 173, b: 247 }, // Moderate Negative (Light Blue)
    { pos: 0.5, r: 240, g: 240, b: 240 },  // Zero Baseline (Neutral Light Gray)
    { pos: 0.75, r: 244, g: 139, b: 116 }, // Moderate Positive (Salmon Orange)
    { pos: 1.0, r: 180, g: 4, b: 38 },     // Strong Positive Anomaly (Crimson Red)
  ],
  viridis: [
    { pos: 0.0, r: 68, g: 1, b: 84 },      // Low Bouguer (Deep Purple)
    { pos: 0.25, r: 59, g: 82, b: 139 },   // Indigo
    { pos: 0.5, r: 33, g: 145, b: 140 },   // Teal
    { pos: 0.75, r: 94, g: 201, b: 98 },   // Light Green
    { pos: 1.0, r: 253, g: 231, b: 37 },   // High Bouguer (Bright Yellow)
  ],
  turbo: [
    { pos: 0.0, r: 48, g: 18, b: 59 },
    { pos: 0.2, r: 70, g: 134, b: 251 },
    { pos: 0.4, r: 27, g: 229, b: 181 },
    { pos: 0.6, r: 164, g: 252, b: 60 },
    { pos: 0.8, r: 251, g: 126, b: 33 },
    { pos: 1.0, r: 122, g: 4, b: 3 },
  ],
};

/**
 * Maps a numeric value within [min, max] to an interpolated RGBA color.
 */
export function getInterpolatedColor(
  value: number,
  min: number,
  max: number,
  colormap: ColormapName = 'gebco'
): [number, number, number, number] {
  if (max <= min) return [128, 128, 128, 255];

  // Normalized position between 0 and 1
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const stops = COLORMAPS[colormap] || COLORMAPS.gebco;

  let lower = stops[0];
  let upper = stops[stops.length - 1];

  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i].pos && t <= stops[i + 1].pos) {
      lower = stops[i];
      upper = stops[i + 1];
      break;
    }
  }

  const range = upper.pos - lower.pos;
  const localT = range === 0 ? 0 : (t - lower.pos) / range;

  const r = Math.round(lower.r + (upper.r - lower.r) * localT);
  const g = Math.round(lower.g + (upper.g - lower.g) * localT);
  const b = Math.round(lower.b + (upper.b - lower.b) * localT);

  return [r, g, b, 255];
}

/**
 * Returns a CSS rgba() string for a value.
 */
export function getCssColor(value: number, min: number, max: number, colormap: ColormapName): string {
  const [r, g, b, a] = getInterpolatedColor(value, min, max, colormap);
  return `rgba(${r}, ${g}, ${b}, ${a / 255})`;
}

/**
 * Returns CSS linear-gradient string for rendering colorbar legends.
 */
export function getColormapGradient(colormap: ColormapName): string {
  const stops = COLORMAPS[colormap] || COLORMAPS.gebco;
  const parts = stops.map((s) => `rgb(${s.r}, ${s.g}, ${s.b}) ${Math.round(s.pos * 100)}%`);
  return `linear-gradient(to right, ${parts.join(', ')})`;
}
