import type { TerrainTileKind } from "../classes/GameProtocol";

const indexes = (count: number) => Array.from({ length: count }, (_, index) => index);
const defaultTerrainSeed = 42;

export type CavePath = {
  depth: number;
  wave: number;
  frequency: number;
  phase: number;
  radius: number;
  roughness: number;
  seedOffset: number;
};

export type TerrainLayerDefinition = {
  maxDepth?: number;
  kind: TerrainTileKind;
};

export type TerrainCaveConfig = {
  surfaceBuffer: number;
  bedrockBuffer: number;
  paths: CavePath[];
};

export type TerrainTileBiomeConfig = {
  seed?: number;
  layers?: TerrainLayerDefinition[];
  caves?: TerrainCaveConfig;
  bedrockKind?: TerrainTileKind;
};

export type TerrainTileBuildOptions = {
  seed?: number;
  biomeAtColumn?: (column: number) => TerrainTileBiomeConfig;
};

const defaultCavePaths: CavePath[] = [
  {
    depth: 0.24,
    wave: 5.5,
    frequency: 0.08,
    phase: 0.7,
    radius: 1.8,
    roughness: 1.3,
    seedOffset: 11,
  },
  {
    depth: 0.48,
    wave: 7.5,
    frequency: 0.06,
    phase: 2.4,
    radius: 2.4,
    roughness: 1.6,
    seedOffset: 29,
  },
  {
    depth: 0.72,
    wave: 6.4,
    frequency: 0.075,
    phase: 4.1,
    radius: 2.1,
    roughness: 1.5,
    seedOffset: 47,
  },
];

export const defaultTerrainLayers: TerrainLayerDefinition[] = [
  { maxDepth: 0, kind: "grass" },
  { maxDepth: 4, kind: "dirt" },
  { kind: "stone" },
];

export const defaultTerrainCaves: TerrainCaveConfig = {
  surfaceBuffer: 11,
  bedrockBuffer: 4,
  paths: defaultCavePaths,
};

export const defaultTerrainTileBiomeConfig: Required<TerrainTileBiomeConfig> = {
  seed: defaultTerrainSeed,
  layers: defaultTerrainLayers,
  caves: defaultTerrainCaves,
  bedrockKind: "bedrock",
};

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
  seed: number,
) => {
  const scaledX = x * scale;
  const scaledY = y * scale;
  const sampleX = Math.floor(scaledX);
  const sampleY = Math.floor(scaledY);
  const blendX = fade(scaledX - sampleX);
  const blendY = fade(scaledY - sampleY);
  const top = lerp(
    noiseAt(sampleX, sampleY, seed + seedOffset),
    noiseAt(sampleX + 1, sampleY, seed + seedOffset),
    blendX,
  );
  const bottom = lerp(
    noiseAt(sampleX, sampleY + 1, seed + seedOffset),
    noiseAt(sampleX + 1, sampleY + 1, seed + seedOffset),
    blendX,
  );
  return lerp(top, bottom, blendY);
};

const caveDepthRange = (
  rows: number,
  surfaceStart: number,
  caves: TerrainCaveConfig,
) => Math.max(1, rows - surfaceStart - caves.surfaceBuffer - caves.bedrockBuffer);

const caveStartRow = (surfaceStart: number, caves: TerrainCaveConfig) =>
  surfaceStart + caves.surfaceBuffer;

const caveCenterRow = (
  column: number,
  rows: number,
  surfaceStart: number,
  path: CavePath,
  caves: TerrainCaveConfig,
  seed: number,
) => {
  const baseDepth =
    caveStartRow(surfaceStart, caves) +
    caveDepthRange(rows, surfaceStart, caves) * path.depth;
  const wave = Math.sin(column * path.frequency + path.phase) * path.wave;
  const drift =
    (valueNoiseAt(column, path.phase * 17, 0.045, path.seedOffset, seed) - 0.5) *
    path.wave;
  return baseDepth + wave + drift;
};

const caveRadiusAt = (column: number, row: number, path: CavePath, seed: number) =>
  path.radius +
  (valueNoiseAt(column, row, 0.14, path.seedOffset + 101, seed) - 0.5) *
    path.roughness;

const isInsideCavePath = (
  column: number,
  row: number,
  rows: number,
  surfaceStart: number,
  path: CavePath,
  caves: TerrainCaveConfig,
  seed: number,
) => {
  const centerRow = caveCenterRow(column, rows, surfaceStart, path, caves, seed);
  const edgeWobble =
    (valueNoiseAt(column, row, 0.2, path.seedOffset + 211, seed) - 0.5) * 1.2;
  return Math.abs(row - centerRow) <= caveRadiusAt(column, row, path, seed) + edgeWobble;
};

const isCaveTile = (
  column: number,
  row: number,
  rows: number,
  surfaceStart: number,
  caves: TerrainCaveConfig,
  seed: number,
) => {
  if (row <= surfaceStart + caves.surfaceBuffer) {
    return false;
  }
  if (row >= rows - caves.bedrockBuffer) {
    return false;
  }
  return caves.paths.some((path) =>
    isInsideCavePath(column, row, rows, surfaceStart, path, caves, seed),
  );
};

const resolvedTerrainConfig = (
  options: TerrainTileBuildOptions,
  column: number,
): Required<TerrainTileBiomeConfig> => {
  const biome = options.biomeAtColumn?.(column) ?? {};
  return {
    seed: biome.seed ?? options.seed ?? defaultTerrainTileBiomeConfig.seed,
    layers: biome.layers ?? defaultTerrainTileBiomeConfig.layers,
    caves: biome.caves ?? defaultTerrainTileBiomeConfig.caves,
    bedrockKind: biome.bedrockKind ?? defaultTerrainTileBiomeConfig.bedrockKind,
  };
};

const terrainLayerKindForDepth = (
  depth: number,
  layers: TerrainLayerDefinition[],
): TerrainTileKind =>
  layers.find((layer) => layer.maxDepth === undefined || depth <= layer.maxDepth)?.kind ??
  "stone";

const terrainTileKindFor = (
  row: number,
  rows: number,
  surfaceStart: number,
  config: Required<TerrainTileBiomeConfig>,
): TerrainTileKind => {
  if (row === rows - 1) {
    return config.bedrockKind;
  }
  return terrainLayerKindForDepth(row - surfaceStart, config.layers);
};

export const buildTerrainTilesFromSurface = (
  columns: number,
  rows: number,
  surfaceStartByColumn: number[],
  options: TerrainTileBuildOptions = {},
) =>
  Object.fromEntries(
    indexes(columns).flatMap((column) => {
      const config = resolvedTerrainConfig(options, column);
      return indexes(rows)
        .filter((row) => row >= surfaceStartByColumn[column])
        .filter(
          (row) =>
            !isCaveTile(
              column,
              row,
              rows,
              surfaceStartByColumn[column],
              config.caves,
              config.seed,
            ),
        )
        .map((row) => [
          terrainTileKey(column, row),
          terrainTileKindFor(row, rows, surfaceStartByColumn[column], config),
        ]);
    }),
  ) as Record<string, TerrainTileKind>;
