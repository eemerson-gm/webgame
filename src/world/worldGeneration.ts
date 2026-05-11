import type { EntityState, TerrainTileKind } from "../classes/GameProtocol";
import { TILE_PX } from "./worldConfig";
import { Structure } from "./Structure";
import { buildSurfaceStartByColumn } from "./terrainGen";
import { buildTerrainTilesFromSurface, terrainTileKey } from "./terrainTiles";
import type {
  StructurePlacementDefinition,
  WorldDefinition,
  WorldStructureDefinition,
} from "./worldDefinition";
import { biomeDefinitions, structureDefinitions } from "./worldDefinition";

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

const biomeIdForColumn = (definition: WorldDefinition, column: number) => {
  const band =
    definition.biomeBands.find(
      (b) => column >= b.startColumn && column <= b.endColumn,
    ) ?? definition.biomeBands[0];
  return band?.biome ?? "";
};

const biomeTerrainForColumn = (definition: WorldDefinition, column: number) =>
  biomeDefinitions[biomeIdForColumn(definition, column)].terrain;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const structureWidth = (structureRows: string[]) => structureRows[0].length;
const structureHeight = (structureRows: string[]) => structureRows.length;

const worldCenterSurfaceOrigin = (options: {
  structureRows: string[];
  dimensions: WorldDefinition["dimensions"];
  surfaceStartByColumn: number[];
  placement: StructurePlacementDefinition;
}) => {
  const width = structureWidth(options.structureRows);
  const height = structureHeight(options.structureRows);
  const centerColumn = Math.floor(options.dimensions.columns / 2);
  const columnOffset = options.placement.columnOffset ?? 0;
  const rowOffset = options.placement.rowOffset ?? 0;
  const originColumn = clamp(
    centerColumn - Math.floor(width / 2) + columnOffset,
    0,
    options.dimensions.columns - width,
  );
  const surfaceRow =
    options.surfaceStartByColumn[centerColumn] ?? Math.floor(options.dimensions.rows / 2);
  return {
    column: originColumn,
    row: clamp(surfaceRow + rowOffset, 0, options.dimensions.rows - height),
  };
};

const structureForPlacement = (
  definition: WorldDefinition,
  surfaceStartByColumn: number[],
  placement: WorldStructureDefinition,
) => {
  const structDef = structureDefinitions[placement.structure];
  return new Structure({
    origin: worldCenterSurfaceOrigin({
      structureRows: structDef.rows,
      dimensions: definition.dimensions,
      surfaceStartByColumn,
      placement: placement.placement,
    }),
    rows: structDef.rows,
    palette: structDef.palette,
    spawnOffset: structDef.spawnOffset,
  });
};

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
    biomeAtColumn: (column) => biomeTerrainForColumn(definition, column),
  });
  const protectedTerrainTiles = new Set<string>();
  const structureResults = definition.structures.map((p) => ({
    placement: p,
    structure: structureForPlacement(definition, surfaceStartByColumn, p),
  }));

  structureResults.forEach(({ placement, structure }) => {
    structure.applyTo(terrainTiles);
    if (!placement.protectTiles) {
      return;
    }
    structure.tileKeys().forEach((key) => protectedTerrainTiles.add(key));
  });

  definition.decorations.forEach((decoration) => {
    decoration.columns.forEach((column) => {
      const row = surfaceStartByColumn[column] - 1;
      const key = terrainTileKey(column, row);
      if (decoration.skipProtected && protectedTerrainTiles.has(key)) {
        return;
      }
      terrainTiles[key] = decoration.tile;
    });
  });

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
    entitiesData: {} as Record<string, EntityState>,
  };
};
