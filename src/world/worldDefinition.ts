import type { TerrainTileKind } from "../classes/GameProtocol";
import { isTerrainTileKind } from "../classes/TerrainTileKinds";
import grasslandsJson from "../data/biomes/grasslands.json";
import stoneDepthsJson from "../data/biomes/stoneDepths.json";
import spawnJson from "../data/structures/spawn.json";
import publicWorldJson from "../data/worlds/public.json";
import type { TerrainGenConfig } from "./terrainGen";
import type {
  CavePath,
  TerrainCaveConfig,
  TerrainLayerDefinition,
  TerrainTileBiomeConfig,
} from "./terrainTiles";

type JsonObject = Record<string, unknown>;

export type WorldDimensionsDefinition = {
  columns: number;
  rows: number;
};

export type WorldSurfaceDefinition = Partial<
  Omit<TerrainGenConfig, "columns" | "rows" | "seed">
>;

export type BiomeBandDefinition = {
  biome: string;
  startColumn: number;
  endColumn: number;
};

export type StructurePlacementDefinition = {
  kind: "worldCenterSurface";
  rowOffset?: number;
  columnOffset?: number;
};

export type WorldStructureDefinition = {
  structure: string;
  placement: StructurePlacementDefinition;
  protectTiles: boolean;
  setsPlayerSpawn: boolean;
};

export type TileAboveSurfaceDecorationDefinition = {
  kind: "tileAboveSurface";
  tile: TerrainTileKind;
  columns: number[];
  skipProtected: boolean;
};

export type WorldDecorationDefinition = TileAboveSurfaceDecorationDefinition;

export type WorldDefinition = {
  id: string;
  name: string;
  dimensions: WorldDimensionsDefinition;
  surface: WorldSurfaceDefinition;
  biomeBands: BiomeBandDefinition[];
  structures: WorldStructureDefinition[];
  decorations: WorldDecorationDefinition[];
};

export type BiomeDefinition = {
  id: string;
  terrain: TerrainTileBiomeConfig;
};

export type StructureDefinition = {
  id: string;
  rows: string[];
  palette: Record<string, TerrainTileKind | null>;
  spawnOffset: {
    column: number;
    row: number;
  };
};

const rawWorldDefinitions = {
  public: publicWorldJson,
} satisfies Record<string, unknown>;

const rawBiomeDefinitions = {
  grasslands: grasslandsJson,
  stoneDepths: stoneDepthsJson,
} satisfies Record<string, unknown>;

const rawStructureDefinitions = {
  spawn: spawnJson,
} satisfies Record<string, unknown>;

const isRecord = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const fail = (source: string, message: string): never => {
  throw new Error(`${source}: ${message}`);
};

const requireRecord = (value: unknown, source: string): JsonObject => {
  if (!isRecord(value)) {
    fail(source, "must be an object");
  }
  return value as JsonObject;
};

const requireString = (value: unknown, source: string): string => {
  if (typeof value !== "string" || value.length === 0) {
    fail(source, "must be a non-empty string");
  }
  return value as string;
};

const requireNumber = (value: unknown, source: string): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(source, "must be a finite number");
  }
  return value as number;
};

const requireInteger = (value: unknown, source: string): number => {
  const number = requireNumber(value, source);
  if (!Number.isInteger(number)) {
    fail(source, "must be an integer");
  }
  return number;
};

const requirePositiveInteger = (value: unknown, source: string): number => {
  const number = requireInteger(value, source);
  if (number <= 0) {
    fail(source, "must be a positive integer");
  }
  return number;
};

const requireBoolean = (value: unknown, source: string): boolean => {
  if (typeof value !== "boolean") {
    fail(source, "must be a boolean");
  }
  return value as boolean;
};

const requireArray = (value: unknown, source: string): unknown[] => {
  if (!Array.isArray(value)) {
    fail(source, "must be an array");
  }
  return value as unknown[];
};

const optionalNumber = (value: unknown, source: string): number | undefined => {
  if (value === undefined) {
    return undefined;
  }
  return requireNumber(value, source);
};

const optionalInteger = (value: unknown, source: string): number | undefined => {
  if (value === undefined) {
    return undefined;
  }
  return requireInteger(value, source);
};

const validateTerrainTileKind = (
  value: unknown,
  source: string,
): TerrainTileKind => {
  if (!isTerrainTileKind(value)) {
    fail(source, "must be a terrain tile kind");
  }
  return value as TerrainTileKind;
};

const validateSurface = (value: unknown, source: string): WorldSurfaceDefinition => {
  if (value === undefined) {
    return {};
  }
  const record = requireRecord(value, source);
  return {
    ...(optionalNumber(record.noiseOffsetY, `${source}.noiseOffsetY`) === undefined
      ? {}
      : { noiseOffsetY: optionalNumber(record.noiseOffsetY, `${source}.noiseOffsetY`) }),
    ...(optionalNumber(record.noiseScaleX, `${source}.noiseScaleX`) === undefined
      ? {}
      : { noiseScaleX: optionalNumber(record.noiseScaleX, `${source}.noiseScaleX`) }),
    ...(optionalInteger(record.minGroundDepth, `${source}.minGroundDepth`) === undefined
      ? {}
      : { minGroundDepth: optionalInteger(record.minGroundDepth, `${source}.minGroundDepth`) }),
    ...(optionalInteger(record.surfaceVariationDepth, `${source}.surfaceVariationDepth`) === undefined
      ? {}
      : {
          surfaceVariationDepth: optionalInteger(
            record.surfaceVariationDepth,
            `${source}.surfaceVariationDepth`,
          ),
        }),
    ...(optionalInteger(record.fractalOctaves, `${source}.fractalOctaves`) === undefined
      ? {}
      : { fractalOctaves: optionalInteger(record.fractalOctaves, `${source}.fractalOctaves`) }),
    ...(optionalNumber(record.persistence, `${source}.persistence`) === undefined
      ? {}
      : { persistence: optionalNumber(record.persistence, `${source}.persistence`) }),
    ...(optionalNumber(record.lacunarity, `${source}.lacunarity`) === undefined
      ? {}
      : { lacunarity: optionalNumber(record.lacunarity, `${source}.lacunarity`) }),
    ...(optionalNumber(record.warpScale, `${source}.warpScale`) === undefined
      ? {}
      : { warpScale: optionalNumber(record.warpScale, `${source}.warpScale`) }),
    ...(optionalNumber(record.warpAmplitude, `${source}.warpAmplitude`) === undefined
      ? {}
      : { warpAmplitude: optionalNumber(record.warpAmplitude, `${source}.warpAmplitude`) }),
    ...(optionalNumber(record.sampleYWobble, `${source}.sampleYWobble`) === undefined
      ? {}
      : { sampleYWobble: optionalNumber(record.sampleYWobble, `${source}.sampleYWobble`) }),
  };
};

const validateDimensions = (value: unknown, source: string): WorldDimensionsDefinition => {
  const record = requireRecord(value, source);
  return {
    columns: requirePositiveInteger(record.columns, `${source}.columns`),
    rows: requirePositiveInteger(record.rows, `${source}.rows`),
  };
};

const validateBiomeBand = (value: unknown, source: string): BiomeBandDefinition => {
  const record = requireRecord(value, source);
  const startColumn = requireInteger(record.startColumn, `${source}.startColumn`);
  const endColumn = requireInteger(record.endColumn, `${source}.endColumn`);
  if (endColumn < startColumn) {
    fail(source, "endColumn must be greater than or equal to startColumn");
  }
  return {
    biome: requireString(record.biome, `${source}.biome`),
    startColumn,
    endColumn,
  };
};

const validatePlacement = (
  value: unknown,
  source: string,
): StructurePlacementDefinition => {
  const record = requireRecord(value, source);
  const kind = requireString(record.kind, `${source}.kind`);
  if (kind !== "worldCenterSurface") {
    fail(source, "must use worldCenterSurface placement");
  }
  return {
    kind: "worldCenterSurface" as const,
    ...(optionalInteger(record.rowOffset, `${source}.rowOffset`) === undefined
      ? {}
      : { rowOffset: optionalInteger(record.rowOffset, `${source}.rowOffset`) }),
    ...(optionalInteger(record.columnOffset, `${source}.columnOffset`) === undefined
      ? {}
      : { columnOffset: optionalInteger(record.columnOffset, `${source}.columnOffset`) }),
  };
};

const validateWorldStructure = (
  value: unknown,
  source: string,
): WorldStructureDefinition => {
  const record = requireRecord(value, source);
  return {
    structure: requireString(record.structure, `${source}.structure`),
    placement: validatePlacement(record.placement, `${source}.placement`),
    protectTiles: requireBoolean(record.protectTiles, `${source}.protectTiles`),
    setsPlayerSpawn: requireBoolean(record.setsPlayerSpawn, `${source}.setsPlayerSpawn`),
  };
};

const validateDecoration = (
  value: unknown,
  source: string,
): WorldDecorationDefinition => {
  const record = requireRecord(value, source);
  const kind = requireString(record.kind, `${source}.kind`);
  if (kind !== "tileAboveSurface") {
    fail(source, "must use tileAboveSurface decoration");
  }
  return {
    kind: "tileAboveSurface" as const,
    tile: validateTerrainTileKind(record.tile, `${source}.tile`),
    columns: requireArray(record.columns, `${source}.columns`).map((column, index) =>
      requireInteger(column, `${source}.columns[${index}]`),
    ),
    skipProtected: requireBoolean(record.skipProtected, `${source}.skipProtected`),
  };
};

const validateLayer = (value: unknown, source: string): TerrainLayerDefinition => {
  const record = requireRecord(value, source);
  return {
    ...(optionalInteger(record.maxDepth, `${source}.maxDepth`) === undefined
      ? {}
      : { maxDepth: optionalInteger(record.maxDepth, `${source}.maxDepth`) }),
    kind: validateTerrainTileKind(record.kind, `${source}.kind`),
  };
};

const validateCavePath = (value: unknown, source: string): CavePath => {
  const record = requireRecord(value, source);
  return {
    depth: requireNumber(record.depth, `${source}.depth`),
    wave: requireNumber(record.wave, `${source}.wave`),
    frequency: requireNumber(record.frequency, `${source}.frequency`),
    phase: requireNumber(record.phase, `${source}.phase`),
    radius: requireNumber(record.radius, `${source}.radius`),
    roughness: requireNumber(record.roughness, `${source}.roughness`),
    seedOffset: requireNumber(record.seedOffset, `${source}.seedOffset`),
  };
};

const validateCaves = (value: unknown, source: string): TerrainCaveConfig => {
  const record = requireRecord(value, source);
  return {
    surfaceBuffer: requirePositiveInteger(record.surfaceBuffer, `${source}.surfaceBuffer`),
    bedrockBuffer: requirePositiveInteger(record.bedrockBuffer, `${source}.bedrockBuffer`),
    paths: requireArray(record.paths, `${source}.paths`).map((path, index) =>
      validateCavePath(path, `${source}.paths[${index}]`),
    ),
  };
};

const validateTerrain = (value: unknown, source: string): TerrainTileBiomeConfig => {
  const record = requireRecord(value, source);
  return {
    ...(record.layers === undefined
      ? {}
      : {
          layers: requireArray(record.layers, `${source}.layers`).map((layer, index) =>
            validateLayer(layer, `${source}.layers[${index}]`),
          ),
        }),
    ...(record.caves === undefined ? {} : { caves: validateCaves(record.caves, `${source}.caves`) }),
    ...(record.bedrockKind === undefined
      ? {}
      : {
          bedrockKind: validateTerrainTileKind(
            record.bedrockKind,
            `${source}.bedrockKind`,
          ),
        }),
  };
};

const validateWorldDefinition = (value: unknown, source: string): WorldDefinition => {
  const record = requireRecord(value, source);
  return {
    id: requireString(record.id, `${source}.id`),
    name: requireString(record.name, `${source}.name`),
    dimensions: validateDimensions(record.dimensions, `${source}.dimensions`),
    surface: validateSurface(record.surface, `${source}.surface`),
    biomeBands: requireArray(record.biomeBands, `${source}.biomeBands`).map((band, index) =>
      validateBiomeBand(band, `${source}.biomeBands[${index}]`),
    ),
    structures: requireArray(record.structures, `${source}.structures`).map(
      (structure, index) =>
        validateWorldStructure(structure, `${source}.structures[${index}]`),
    ),
    decorations: requireArray(record.decorations, `${source}.decorations`).map(
      (decoration, index) =>
        validateDecoration(decoration, `${source}.decorations[${index}]`),
    ),
  };
};

const validateBiomeDefinition = (value: unknown, source: string): BiomeDefinition => {
  const record = requireRecord(value, source);
  return {
    id: requireString(record.id, `${source}.id`),
    terrain: validateTerrain(record.terrain, `${source}.terrain`),
  };
};

const validatePalette = (
  value: unknown,
  rows: string[],
  source: string,
): Record<string, TerrainTileKind | null> => {
  const record = requireRecord(value, source);
  const palette = Object.fromEntries(
    Object.entries(record).map(([symbol, kind]) => [
      symbol,
      kind === null ? null : validateTerrainTileKind(kind, `${source}.${symbol}`),
    ]),
  );
  const rowSymbols = Array.from(new Set(rows.join("").split("")));
  rowSymbols.forEach((symbol) => {
    if (!(symbol in palette)) {
      fail(source, `missing palette symbol ${symbol}`);
    }
  });
  return palette;
};

const validateStructureRows = (value: unknown, source: string) => {
  const rows = requireArray(value, source).map((row, index) =>
    requireString(row, `${source}[${index}]`),
  );
  if (rows.length === 0) {
    fail(source, "must have at least one row");
  }
  const width = rows[0].length;
  rows.forEach((row, index) => {
    if (row.length !== width) {
      fail(`${source}[${index}]`, "all rows must have the same width");
    }
  });
  return rows;
};

const validateStructureDefinition = (
  value: unknown,
  source: string,
): StructureDefinition => {
  const record = requireRecord(value, source);
  const rows = validateStructureRows(record.rows, `${source}.rows`);
  return {
    id: requireString(record.id, `${source}.id`),
    rows,
    palette: validatePalette(record.palette, rows, `${source}.palette`),
    spawnOffset: {
      column: requireInteger(
        requireRecord(record.spawnOffset, `${source}.spawnOffset`).column,
        `${source}.spawnOffset.column`,
      ),
      row: requireInteger(
        requireRecord(record.spawnOffset, `${source}.spawnOffset`).row,
        `${source}.spawnOffset.row`,
      ),
    },
  };
};

const validateRegistry = <T>(
  rawDefinitions: Record<string, unknown>,
  validate: (value: unknown, source: string) => T,
) =>
  Object.fromEntries(
    Object.entries(rawDefinitions).map(([id, value]) => [id, validate(value, id)]),
  ) as Record<string, T>;

export const worldDefinitions = validateRegistry(
  rawWorldDefinitions,
  validateWorldDefinition,
);
export const biomeDefinitions = validateRegistry(
  rawBiomeDefinitions,
  validateBiomeDefinition,
);
export const structureDefinitions = validateRegistry(
  rawStructureDefinitions,
  validateStructureDefinition,
);

const validateWorldReferences = (definition: WorldDefinition) => {
  definition.biomeBands.forEach((band) => {
    if (!biomeDefinitions[band.biome]) {
      fail(definition.id, `unknown biome ${band.biome}`);
    }
  });
  definition.structures.forEach((structure) => {
    if (!structureDefinitions[structure.structure]) {
      fail(definition.id, `unknown structure ${structure.structure}`);
    }
  });
};

export const loadWorldDefinition = (id: string) => {
  const definition = worldDefinitions[id];
  if (!definition) {
    fail(id, "unknown world definition");
  }
  validateWorldReferences(definition);
  return definition;
};

export const loadBiomeDefinition = (id: string) => {
  const definition = biomeDefinitions[id];
  if (!definition) {
    fail(id, "unknown biome definition");
  }
  return definition;
};

export const loadStructureDefinition = (id: string) => {
  const definition = structureDefinitions[id];
  if (!definition) {
    fail(id, "unknown structure definition");
  }
  return definition;
};
