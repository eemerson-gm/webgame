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

const indexes = (count: number) => Array.from({ length: count }, (_, index) => index);

const fbm2d = (
  x: number,
  y: number,
  perm: number[],
  octaves: number,
  persistence: number,
  lacunarity: number,
) =>
  indexes(octaves).reduce((sum, o) => {
    const f = Math.pow(lacunarity, o);
    const a = Math.pow(persistence, o);
    return sum + a * perlin2d(x * f, y * f, perm);
  }, 0);

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export type TerrainSurfaceParams = {
  noiseOffsetY: number;
  noiseScaleX: number;
  minGroundDepth: number;
  surfaceVariationDepth: number;
  surfaceVariationEpsilon: number;
  fractalOctaves: number;
  persistence: number;
  lacunarity: number;
  warpScale: number;
  warpAmplitude: number;
  sampleYWobble: number;
  averageSurfaceRadius: number;
  maxSurfaceStep: number;
  fbmSpreadScale: number;
  fbmSpreadBaseline: number;
  surfaceRemapContrast: number;
  surfaceRemapNeutral: number;
  warpDomainY0: number;
  warpDomainY1: number;
  warpSecondaryXScaleRatio: number;
  warpPermutationSeedOffset: number;
  surfaceStepRelaxationPasses: number;
  surfaceFloatBlurPasses: number;
};

export type TerrainGenConfig = {
  columns: number;
  rows: number;
  seed: number;
} & TerrainSurfaceParams;

const clampSurfaceStep = (previous: number, next: number, maxSurfaceStep: number) => {
  if (next > previous + maxSurfaceStep) {
    return previous + maxSurfaceStep;
  }
  if (next < previous - maxSurfaceStep) {
    return previous - maxSurfaceStep;
  }
  return next;
};

const averageFloatAt = (
  surface: number[],
  col: number,
  averageSurfaceRadius: number,
) => {
  const sampleColumns = indexes(averageSurfaceRadius * 2 + 1)
    .map((i) => col + i - averageSurfaceRadius)
    .filter((sampleCol) => sampleCol >= 0 && sampleCol < surface.length);
  const total = sampleColumns.reduce((sum, sampleCol) => sum + surface[sampleCol], 0);
  return total / sampleColumns.length;
};

const averageFloatSurface = (surface: number[], averageSurfaceRadius: number) =>
  surface.map((_, col) => averageFloatAt(surface, col, averageSurfaceRadius));

const blurFloatSurfaceRepeatedly = (
  surface: number[],
  averageSurfaceRadius: number,
  surfaceFloatBlurPasses: number,
) =>
  indexes(surfaceFloatBlurPasses).reduce(
    (acc) => averageFloatSurface(acc, averageSurfaceRadius),
    surface,
  );

const limitSurfaceSteps = (surfaceStarts: number[], maxSurfaceStep: number) =>
  surfaceStarts.reduce<number[]>((limitedSurface, nextSurfaceStart) => {
    if (limitedSurface.length === 0) {
      return [nextSurfaceStart];
    }
    const previousSurfaceStart = limitedSurface[limitedSurface.length - 1];
    return [
      ...limitedSurface,
      clampSurfaceStep(previousSurfaceStart, nextSurfaceStart, maxSurfaceStep),
    ];
  }, []);

const limitSurfaceStepsBackward = (surfaceStarts: number[], maxSurfaceStep: number) => {
  if (surfaceStarts.length === 0) {
    return surfaceStarts;
  }
  const result = surfaceStarts.slice();
  let col = result.length - 2;
  while (col >= 0) {
    result[col] = clampSurfaceStep(result[col + 1], result[col], maxSurfaceStep);
    col -= 1;
  }
  return result;
};

const relaxSurfaceSteps = (
  surfaceStarts: number[],
  maxSurfaceStep: number,
  surfaceStepRelaxationPasses: number,
) => {
  if (surfaceStepRelaxationPasses <= 0) {
    return surfaceStarts;
  }
  return indexes(surfaceStepRelaxationPasses).reduce((acc) => {
    const forward = limitSurfaceSteps(acc, maxSurfaceStep);
    return limitSurfaceStepsBackward(forward, maxSurfaceStep);
  }, surfaceStarts);
};

export const buildSurfaceStartByColumn = (options: TerrainGenConfig) => {
  const {
    columns,
    rows,
    seed,
    noiseOffsetY,
    noiseScaleX,
    minGroundDepth,
    surfaceVariationDepth,
    surfaceVariationEpsilon,
    fractalOctaves,
    persistence,
    lacunarity,
    warpScale,
    warpAmplitude,
    sampleYWobble,
    averageSurfaceRadius,
    maxSurfaceStep,
    fbmSpreadScale,
    fbmSpreadBaseline,
    surfaceRemapContrast,
    surfaceRemapNeutral,
    warpDomainY0,
    warpDomainY1,
    warpSecondaryXScaleRatio,
    warpPermutationSeedOffset,
    surfaceStepRelaxationPasses,
    surfaceFloatBlurPasses,
  } = options;

  const perm = makePermutation(seed);
  const permWarp = makePermutation(seed + warpPermutationSeedOffset);
  const minDepthCapped = Math.max(1, Math.min(minGroundDepth, rows));
  const maxVariation = Math.max(0, rows - minDepthCapped);
  const variationCapped = Math.max(0, Math.min(surfaceVariationDepth, maxVariation));

  const toSurfaceT = (col: number) => {
    const warpedX =
      col * noiseScaleX +
      perlin2d(col * warpScale, warpDomainY0, permWarp) * warpAmplitude;
    const sampleY =
      noiseOffsetY +
      perlin2d(col * (warpScale * warpSecondaryXScaleRatio), warpDomainY1, permWarp) *
        sampleYWobble;
    const f = fbm2d(
      warpedX,
      sampleY,
      perm,
      fractalOctaves,
      persistence,
      lacunarity,
    );
    const spread = f * fbmSpreadScale + fbmSpreadBaseline;
    return clamp01(
      surfaceRemapNeutral + (spread - surfaceRemapNeutral) * surfaceRemapContrast,
    );
  };

  const roughSurfaceFloats = indexes(columns).map((col) => {
    const t = toSurfaceT(col);
    const groundDepth =
      minDepthCapped + t * (variationCapped + surfaceVariationEpsilon);
    return rows - groundDepth;
  });
  const smoothedFloats = blurFloatSurfaceRepeatedly(
    roughSurfaceFloats,
    averageSurfaceRadius,
    surfaceFloatBlurPasses,
  );
  const roundedSurface = smoothedFloats.map((v) => Math.round(v));
  const clampedSurface = roundedSurface.map((v) => Math.max(0, Math.min(rows - 1, v)));
  return relaxSurfaceSteps(
    clampedSurface,
    maxSurfaceStep,
    surfaceStepRelaxationPasses,
  );
};
