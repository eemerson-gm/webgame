import type { TerrainTileKind } from "../classes/GameProtocol";
import { TERRAIN_SEED } from "./worldConfig";

const indexes = (count: number) => Array.from({ length: count }, (_, index) => index);
const dirtLayerDepth = 4;
const caveSurfaceBuffer = 7;
const caveBedrockBuffer = 4;

type CavePath = {
  depth: number;
  wave: number;
  frequency: number;
  phase: number;
  radius: number;
  roughness: number;
  seedOffset: number;
};

const cavePaths: CavePath[] = [
  { depth: 0.24, wave: 5.5, frequency: 0.08, phase: 0.7, radius: 1.8, roughness: 1.3, seedOffset: 11 },
  { depth: 0.48, wave: 7.5, frequency: 0.06, phase: 2.4, radius: 2.4, roughness: 1.6, seedOffset: 29 },
  { depth: 0.72, wave: 6.4, frequency: 0.075, phase: 4.1, radius: 2.1, roughness: 1.5, seedOffset: 47 },
];

export const terrainTileKey = (column: number, row: number) => `${column},${row}`;

const fract = (value: number) => value - Math.floor(value);

const noiseAt = (x: number, y: number, seed: number) =>
  fract(Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453123);

const fade = (value: number) => value * value * (3 - 2 * value);
const lerp = (start: number, end: number, amount: number) =>
  start + (end - start) * amount;

const valueNoiseAt = (
  x: number,
  y: number,
  scale: number,
  seedOffset: number,
) => {
  const scaledX = x * scale;
  const scaledY = y * scale;
  const sampleX = Math.floor(scaledX);
  const sampleY = Math.floor(scaledY);
  const blendX = fade(scaledX - sampleX);
  const blendY = fade(scaledY - sampleY);
  const top = lerp(
    noiseAt(sampleX, sampleY, TERRAIN_SEED + seedOffset),
    noiseAt(sampleX + 1, sampleY, TERRAIN_SEED + seedOffset),
    blendX,
  );
  const bottom = lerp(
    noiseAt(sampleX, sampleY + 1, TERRAIN_SEED + seedOffset),
    noiseAt(sampleX + 1, sampleY + 1, TERRAIN_SEED + seedOffset),
    blendX,
  );
  return lerp(top, bottom, blendY);
};

const caveDepthRange = (rows: number, surfaceStart: number) =>
  Math.max(1, rows - surfaceStart - dirtLayerDepth - caveSurfaceBuffer - caveBedrockBuffer);

const caveStartRow = (surfaceStart: number) =>
  surfaceStart + dirtLayerDepth + caveSurfaceBuffer;

const caveCenterRow = (
  column: number,
  rows: number,
  surfaceStart: number,
  path: CavePath,
) => {
  const baseDepth = caveStartRow(surfaceStart) + caveDepthRange(rows, surfaceStart) * path.depth;
  const wave = Math.sin(column * path.frequency + path.phase) * path.wave;
  const drift = (valueNoiseAt(column, path.phase * 17, 0.045, path.seedOffset) - 0.5) * path.wave;
  return baseDepth + wave + drift;
};

const caveRadiusAt = (column: number, row: number, path: CavePath) =>
  path.radius +
  (valueNoiseAt(column, row, 0.14, path.seedOffset + 101) - 0.5) * path.roughness;

const isInsideCavePath = (
  column: number,
  row: number,
  rows: number,
  surfaceStart: number,
  path: CavePath,
) => {
  const centerRow = caveCenterRow(column, rows, surfaceStart, path);
  const edgeWobble = (valueNoiseAt(column, row, 0.2, path.seedOffset + 211) - 0.5) * 1.2;
  return Math.abs(row - centerRow) <= caveRadiusAt(column, row, path) + edgeWobble;
};

const isCaveTile = (
  column: number,
  row: number,
  rows: number,
  surfaceStart: number,
) => {
  if (row <= surfaceStart + dirtLayerDepth + caveSurfaceBuffer) {
    return false;
  }
  if (row >= rows - caveBedrockBuffer) {
    return false;
  }
  return cavePaths.some((path) =>
    isInsideCavePath(column, row, rows, surfaceStart, path),
  );
};

const terrainTileKindFor = (
  row: number,
  rows: number,
  surfaceStart: number,
): TerrainTileKind => {
  if (row === rows - 1) {
    return "bedrock";
  }
  if (row === surfaceStart) {
    return "grass";
  }
  if (row <= surfaceStart + dirtLayerDepth) {
    return "dirt";
  }
  return "stone";
};

export const buildTerrainTilesFromSurface = (
  columns: number,
  rows: number,
  surfaceStartByColumn: number[],
) =>
  Object.fromEntries(
    indexes(columns).flatMap((column) =>
      indexes(rows)
        .filter((row) => row >= surfaceStartByColumn[column])
        .filter(
          (row) =>
            !isCaveTile(column, row, rows, surfaceStartByColumn[column]),
        )
        .map((row) => [
          terrainTileKey(column, row),
          terrainTileKindFor(row, rows, surfaceStartByColumn[column]),
        ]),
    ),
  ) as Record<string, TerrainTileKind>;
