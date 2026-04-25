import type { TerrainTileKind } from "../classes/GameProtocol";

const indexes = (count: number) => Array.from({ length: count }, (_, index) => index);
const dirtLayerDepth = 4;

export const terrainTileKey = (column: number, row: number) => `${column},${row}`;

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
        .map((row) => [
          terrainTileKey(column, row),
          terrainTileKindFor(row, rows, surfaceStartByColumn[column]),
        ]),
    ),
  ) as Record<string, TerrainTileKind>;
