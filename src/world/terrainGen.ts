import { TERRAIN_SEED } from "./worldConfig";

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a: number, b: number, t: number) => a + t * (b - a);

const gradDot = (hash: number, x: number, y: number) => {
  const h = hash & 3;
  if (h === 0) {
    return x;
  }
  if (h === 1) {
    return -x;
  }
  if (h === 2) {
    return y;
  }
  return -y;
};

const perlin2d = (x: number, y: number, perm: number[]) => {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const xs = x0 & 255;
  const ys = y0 & 255;
  const fx = x - x0;
  const fy = y - y0;
  const n00 = gradDot(perm[perm[xs] + ys], fx, fy);
  const n10 = gradDot(perm[perm[xs + 1] + ys], fx - 1, fy);
  const n01 = gradDot(perm[perm[xs] + ys + 1], fx, fy - 1);
  const n11 = gradDot(perm[perm[xs + 1] + ys + 1], fx - 1, fy - 1);
  return lerp(
    lerp(n00, n10, fade(fx)),
    lerp(n01, n11, fade(fx)),
    fade(fy),
  );
};

const lcg = (seed: number) => {
  const state = { v: (Math.imul(seed, 1000003) ^ 0x2e317ab5) & 0x7fffffff };
  if (state.v === 0) {
    state.v = 0x1b873593;
  }
  return () => {
    state.v = (state.v * 1103515245 + 12345) & 0x7fffffff;
    return state.v / 0x7fffffff;
  };
};

const fisherYates = (items: number[], i: number, random: () => number): void => {
  if (i <= 0) {
    return;
  }
  const j = Math.floor(random() * (i + 1));
  const tmp = items[i];
  items[i] = items[j];
  items[j] = tmp;
  fisherYates(items, i - 1, random);
};

const makePermutation = (seed: number) => {
  const indices = Array.from({ length: 256 }, (_, i) => i);
  const random = lcg(seed);
  fisherYates(indices, 255, random);
  return indices.concat(indices);
};

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

const fbm2d = (
  x: number,
  y: number,
  perm: number[],
  octaves: number,
  persistence: number,
  lacunarity: number,
) => {
  const count = Math.max(1, octaves);
  return range(count).reduce((sum, o) => {
    const f = Math.pow(lacunarity, o);
    const a = Math.pow(persistence, o);
    return sum + a * perlin2d(x * f, y * f, perm);
  }, 0);
};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export type TerrainGenConfig = {
  columns: number;
  rows: number;
  seed?: number;
  noiseOffsetY?: number;
  noiseScaleX?: number;
  minGroundDepth?: number;
  surfaceVariationDepth?: number;
  fractalOctaves?: number;
  persistence?: number;
  lacunarity?: number;
  warpScale?: number;
  warpAmplitude?: number;
  sampleYWobble?: number;
};

const defaultGenConfig: Required<
  Pick<
    TerrainGenConfig,
    | "seed"
    | "noiseOffsetY"
    | "noiseScaleX"
    | "minGroundDepth"
    | "fractalOctaves"
    | "persistence"
    | "lacunarity"
    | "warpScale"
    | "warpAmplitude"
    | "sampleYWobble"
  >
> = {
  seed: TERRAIN_SEED,
  noiseOffsetY: 0,
  noiseScaleX: 0.11,
  minGroundDepth: 2,
  fractalOctaves: 5,
  persistence: 0.44,
  lacunarity: 2.2,
  warpScale: 0.07,
  warpAmplitude: 0.9,
  sampleYWobble: 0.8,
};

export const buildSurfaceStartByColumn = (options: TerrainGenConfig) => {
  const {
    columns,
    rows,
    seed = defaultGenConfig.seed,
    noiseOffsetY = defaultGenConfig.noiseOffsetY,
    noiseScaleX = defaultGenConfig.noiseScaleX,
    minGroundDepth = defaultGenConfig.minGroundDepth,
    surfaceVariationDepth: surfaceOverride,
    fractalOctaves = defaultGenConfig.fractalOctaves,
    persistence = defaultGenConfig.persistence,
    lacunarity = defaultGenConfig.lacunarity,
    warpScale = defaultGenConfig.warpScale,
    warpAmplitude = defaultGenConfig.warpAmplitude,
    sampleYWobble = defaultGenConfig.sampleYWobble,
  } = options;

  const perm = makePermutation(seed);
  const permWarp = makePermutation(seed + 7919);
  const minDepthCapped = Math.max(1, Math.min(minGroundDepth, rows));
  const maxVariation = Math.max(0, rows - minDepthCapped);
  const defaultSurfaceVariation = Math.max(
    9,
    Math.min(maxVariation, Math.floor(rows * 0.76)),
  );
  const variationCapped = Math.max(
    0,
    Math.min(
      surfaceOverride !== undefined ? surfaceOverride : defaultSurfaceVariation,
      maxVariation,
    ),
  );

  const toSurfaceT = (col: number) => {
    const warpedX =
      col * noiseScaleX +
      perlin2d(col * warpScale, 7, permWarp) * warpAmplitude;
    const sampleY =
      noiseOffsetY + perlin2d(col * (warpScale * 1.15), 2, permWarp) * sampleYWobble;
    const f = fbm2d(
      warpedX,
      sampleY,
      perm,
      fractalOctaves,
      persistence,
      lacunarity,
    );
    const spread = f * 0.58 + 0.5;
    return clamp01(0.5 + (spread - 0.5) * 1.12);
  };

  return range(columns).map((col) => {
    const t = toSurfaceT(col);
    const numGroundRows =
      minDepthCapped + Math.floor(t * (variationCapped + 0.0001));
    return rows - numGroundRows;
  });
};
