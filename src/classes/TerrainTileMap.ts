import * as ex from "excalibur";
import { Resources } from "../resource";

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

type TerrainOptions = {
  pos?: ex.Vector;
  tileWidth: number;
  tileHeight: number;
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
  renderFromTopOfGraphic?: boolean;
};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export class TerrainTileMap {
  public readonly map: ex.TileMap;

  constructor(options: TerrainOptions) {
    const {
      pos = ex.vec(0, 0),
      tileWidth,
      tileHeight,
      columns,
      rows,
      seed = 1,
      noiseOffsetY = 0,
      noiseScaleX = 0.062,
      minGroundDepth = 2,
      surfaceVariationDepth: surfaceOverride,
      fractalOctaves = 4,
      persistence = 0.47,
      lacunarity = 2.05,
      warpScale = 0.05,
      warpAmplitude = 0.6,
      sampleYWobble = 0.55,
      renderFromTopOfGraphic = true,
    } = options;

    this.map = new ex.TileMap({
      pos,
      tileWidth,
      tileHeight,
      columns,
      rows,
      renderFromTopOfGraphic,
    });

    const perm = makePermutation(seed);
    const permWarp = makePermutation(seed + 7919);
    const minDepthCapped = Math.max(1, Math.min(minGroundDepth, rows));
    const maxVariation = Math.max(0, rows - minDepthCapped);
    const defaultSurfaceVariation = Math.max(
      8,
      Math.min(maxVariation, Math.floor(rows * 0.58)),
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
      return clamp01(f * 0.42 + 0.5);
    };

    const surfaceStartByColumn = range(columns).map(
      (col) => {
        const t = toSurfaceT(col);
        const numGroundRows =
          minDepthCapped + Math.floor(t * (variationCapped + 0.0001));
        return rows - numGroundRows;
      },
    );

    this.map.tiles.forEach((tile) => {
      if (tile.y >= surfaceStartByColumn[tile.x]) {
        tile.addGraphic(Resources.Block.toSprite());
      }
    });
  }
}
