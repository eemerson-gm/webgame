import type { EntityState, TerrainTileKind } from "../classes/GameProtocol";
import { createInitialEntitiesData } from "../simulation/entitySpawns";
import { TILE_PX } from "./worldConfig";
import { buildSurfaceStartByColumn } from "./terrainGen";
import { buildTerrainTilesFromSurface, terrainTileKey } from "./terrainTiles";
import { biomeForColumn } from "./biomeGeneration";
import { structureFromDefinition } from "./structureGeneration";
import type {
  TileAboveSurfaceDecorationDefinition,
  WorldDefinition,
  WorldStructureDefinition,
} from "./worldDefinition";
import { loadStructureDefinition } from "./worldDefinition";

export type GeneratedWorld = {
  columns: number;
  rows: number;
  surfaceStartByColumn: number[];
  terrainTiles: Record<string, TerrainTileKind>;
  protectedTerrainTiles: Set<string>;
  playerSpawn: { x: number; y: number };
  entitiesData: Record<string, EntityState>;
};

const defaultPlayerSpawn = (definition: WorldDefinition) => ({
  x: Math.floor(definition.dimensions.columns / 2) * TILE_PX,
  y: Math.floor(definition.dimensions.rows / 2) * TILE_PX,
});

const randomWorldSeed = () => {
  const seed = Math.floor(Math.random() * 0x7fffffff);
  return seed === 0 ? 1 : seed;
};

const isInsideWorld = (definition: WorldDefinition, column: number, row: number) => {
  if (column < 0 || column >= definition.dimensions.columns) {
    return false;
  }
  if (row < 0 || row >= definition.dimensions.rows) {
    return false;
  }
  return true;
};

const applyTileAboveSurfaceDecoration = (
  terrainTiles: Record<string, TerrainTileKind>,
  protectedTerrainTiles: Set<string>,
  definition: WorldDefinition,
  surfaceStartByColumn: number[],
  decoration: TileAboveSurfaceDecorationDefinition,
) => {
  decoration.columns.forEach((column) => {
    const row = surfaceStartByColumn[column] - 1;
    const key = terrainTileKey(column, row);
    if (!isInsideWorld(definition, column, row)) {
      return;
    }
    if (decoration.skipProtected && protectedTerrainTiles.has(key)) {
      return;
    }
    terrainTiles[key] = decoration.tile;
  });
};

const applyDecoration = (
  terrainTiles: Record<string, TerrainTileKind>,
  protectedTerrainTiles: Set<string>,
  definition: WorldDefinition,
  surfaceStartByColumn: number[],
  decoration: TileAboveSurfaceDecorationDefinition,
) =>
  applyTileAboveSurfaceDecoration(
    terrainTiles,
    protectedTerrainTiles,
    definition,
    surfaceStartByColumn,
    decoration,
  );

const buildStructure = (
  definition: WorldDefinition,
  surfaceStartByColumn: number[],
  placement: WorldStructureDefinition,
) =>
  structureFromDefinition({
    definition: loadStructureDefinition(placement.structure),
    dimensions: definition.dimensions,
    surfaceStartByColumn,
    placement: placement.placement,
  });

export const generateWorld = (
  definition: WorldDefinition,
  seed: number = randomWorldSeed(),
): GeneratedWorld => {
  const columns = definition.dimensions.columns;
  const rows = definition.dimensions.rows;
  const surfaceStartByColumn = buildSurfaceStartByColumn({
    columns,
    rows,
    seed,
    ...definition.surface,
  });
  const terrainTiles = buildTerrainTilesFromSurface(columns, rows, surfaceStartByColumn, {
    seed,
    biomeAtColumn: (column) => biomeForColumn(definition, column).terrain,
  });
  const protectedTerrainTiles = new Set<string>();
  const structureResults = definition.structures.map((placement) => ({
    placement,
    structure: buildStructure(definition, surfaceStartByColumn, placement),
  }));

  structureResults.forEach(({ placement, structure }) => {
    structure.applyTo(terrainTiles);
    if (!placement.protectTiles) {
      return;
    }
    structure.tileKeys().forEach((key) => protectedTerrainTiles.add(key));
  });

  definition.decorations.forEach((decoration) =>
    applyDecoration(
      terrainTiles,
      protectedTerrainTiles,
      definition,
      surfaceStartByColumn,
      decoration,
    ),
  );

  return {
    columns,
    rows,
    surfaceStartByColumn,
    terrainTiles,
    protectedTerrainTiles,
    playerSpawn:
      structureResults.find(({ placement }) => placement.setsPlayerSpawn)?.structure.spawnPosition(
        TILE_PX,
      ) ?? defaultPlayerSpawn(definition),
    entitiesData: createInitialEntitiesData(),
  };
};
