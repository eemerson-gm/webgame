import type { TerrainTileKind } from "../classes/GameProtocol";

const indexes = (count: number) => Array.from({ length: count }, (_, index) => index);

export const terrainTileKey = (column: number, row: number) => `${column},${row}`;

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
          row === surfaceStartByColumn[column] ? "grass" : "dirt",
        ]),
    ),
  ) as Record<string, TerrainTileKind>;
