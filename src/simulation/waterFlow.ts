import type {
  TerrainTileKind,
  WaterFlowDirection,
  WaterTiles,
  WaterTilesUpdatePayload,
} from "../classes/GameProtocol";
import { terrainTileKey } from "../world/terrainTiles";

type WaterPosition = {
  column: number;
  row: number;
};

export type WaterFlowWorld = {
  columns: number;
  rows: number;
  terrainTiles: Record<string, TerrainTileKind>;
  waterTiles: WaterTiles;
  flowDirections?: Record<string, WaterFlowDirection>;
};

export type WaterFlowResult = {
  waterTiles: WaterTiles;
  flowDirections: Record<string, WaterFlowDirection>;
  update: WaterTilesUpdatePayload;
};

const maxWaterLevel = 16;
const surfaceWaterLevel = 10;
const sideFlowAmount = 4;

const indexes = (count: number) => Array.from({ length: count }, (_, index) => index);

const waterPositionFromKey = (key: string): WaterPosition | null => {
  const [column, row] = key.split(",").map(Number);
  if (!Number.isInteger(column) || !Number.isInteger(row)) {
    return null;
  }
  return { column, row };
};

const isInsideWaterWorld = (
  column: number,
  row: number,
  columns: number,
  rows: number,
) => {
  if (column < 0 || column >= columns) {
    return false;
  }
  if (row < 0 || row >= rows) {
    return false;
  }
  return true;
};

const isSolidWaterBlocker = (
  column: number,
  row: number,
  world: Pick<WaterFlowWorld, "columns" | "rows" | "terrainTiles">,
) => {
  if (!isInsideWaterWorld(column, row, world.columns, world.rows)) {
    return true;
  }
  return !!world.terrainTiles[terrainTileKey(column, row)];
};

const waterLevelAt = (tiles: WaterTiles, column: number, row: number) =>
  tiles[terrainTileKey(column, row)] ?? 0;

const rememberWaterLevel = (tiles: WaterTiles, key: string, level: number) => {
  const nextLevel = Math.max(0, Math.min(maxWaterLevel, level));
  if (nextLevel <= 0) {
    delete tiles[key];
    return;
  }
  tiles[key] = nextLevel;
};

const transferWater = (
  tiles: WaterTiles,
  fromKey: string,
  toKey: string,
  amount: number,
) => {
  const available = tiles[fromKey] ?? 0;
  const target = tiles[toKey] ?? 0;
  const moved = Math.max(0, Math.min(amount, available, maxWaterLevel - target));
  if (moved <= 0) {
    return false;
  }
  rememberWaterLevel(tiles, fromKey, available - moved);
  rememberWaterLevel(tiles, toKey, target + moved);
  return true;
};

const bestSideTarget = (
  position: WaterPosition,
  tiles: WaterTiles,
  world: Pick<WaterFlowWorld, "columns" | "rows" | "terrainTiles">,
) =>
  [
    { column: position.column - 1, row: position.row, direction: "left" as const },
    { column: position.column + 1, row: position.row, direction: "right" as const },
  ]
    .filter((side) => !isSolidWaterBlocker(side.column, side.row, world))
    .sort(
      (a, b) =>
        waterLevelAt(tiles, a.column, a.row) -
        waterLevelAt(tiles, b.column, b.row),
    )[0] ?? null;

const stepWaterCell = (
  key: string,
  tiles: WaterTiles,
  directions: Record<string, WaterFlowDirection>,
  world: Pick<WaterFlowWorld, "columns" | "rows" | "terrainTiles">,
) => {
  const position = waterPositionFromKey(key);
  const level = tiles[key] ?? 0;
  if (!position || level <= 0) {
    return;
  }
  if (isSolidWaterBlocker(position.column, position.row, world)) {
    delete tiles[key];
    delete directions[key];
    return;
  }
  const downKey = terrainTileKey(position.column, position.row + 1);
  if (!isSolidWaterBlocker(position.column, position.row + 1, world)) {
    const didMoveDown = transferWater(
      tiles,
      key,
      downKey,
      Math.max(1, Math.min(level, maxWaterLevel - waterLevelAt(tiles, position.column, position.row + 1))),
    );
    if (didMoveDown) {
      directions[key] = "down";
      directions[downKey] = "down";
      return;
    }
  }
  const sideTarget = bestSideTarget(position, tiles, world);
  if (!sideTarget) {
    directions[key] = "still";
    return;
  }
  const sideKey = terrainTileKey(sideTarget.column, sideTarget.row);
  const sideLevel = tiles[sideKey] ?? 0;
  if (sideLevel + 1 >= level) {
    directions[key] = "still";
    return;
  }
  const amount = Math.min(sideFlowAmount, Math.ceil((level - sideLevel) / 2));
  if (!transferWater(tiles, key, sideKey, amount)) {
    directions[key] = "still";
    return;
  }
  directions[key] = sideTarget.direction;
  directions[sideKey] = sideTarget.direction;
};

const sortedWaterKeys = (tiles: WaterTiles) =>
  Object.keys(tiles).sort((a, b) => {
    const aPosition = waterPositionFromKey(a);
    const bPosition = waterPositionFromKey(b);
    return (bPosition?.row ?? 0) - (aPosition?.row ?? 0);
  });

const changedWaterTiles = (previous: WaterTiles, next: WaterTiles) =>
  Object.fromEntries(
    Object.entries(next).filter(([key, level]) => previous[key] !== level),
  );

const removedWaterTiles = (previous: WaterTiles, next: WaterTiles) =>
  Object.keys(previous).filter((key) => next[key] === undefined);

const changedFlowDirections = (
  previous: Record<string, WaterFlowDirection>,
  next: Record<string, WaterFlowDirection>,
) =>
  Object.fromEntries(
    Object.entries(next).filter(([key, direction]) => previous[key] !== direction),
  );

export const placeWaterAt = (
  waterTiles: WaterTiles,
  column: number,
  row: number,
  level: number = maxWaterLevel,
) => ({
  ...waterTiles,
  [terrainTileKey(column, row)]: Math.max(1, Math.min(maxWaterLevel, level)),
});

export const stepWaterFlow = (world: WaterFlowWorld): WaterFlowResult => {
  const previousWaterTiles = { ...world.waterTiles };
  const previousFlowDirections = { ...(world.flowDirections ?? {}) };
  const nextWaterTiles = { ...world.waterTiles };
  const nextFlowDirections = { ...(world.flowDirections ?? {}) };
  sortedWaterKeys(nextWaterTiles).forEach((key) =>
    stepWaterCell(key, nextWaterTiles, nextFlowDirections, world),
  );
  const nextUpdate = {
    waterTiles: changedWaterTiles(previousWaterTiles, nextWaterTiles),
    removedWaterTiles: removedWaterTiles(previousWaterTiles, nextWaterTiles),
    flowDirections: changedFlowDirections(
      previousFlowDirections,
      nextFlowDirections,
    ),
  };
  return {
    waterTiles: nextWaterTiles,
    flowDirections: nextFlowDirections,
    update: nextUpdate,
  };
};

export const buildInitialWaterTiles = (
  columns: number,
  rows: number,
  surfaceStartByColumn: number[],
  terrainTiles: Record<string, TerrainTileKind>,
) =>
  Object.fromEntries(
    indexes(columns)
      .filter((column) => column % 31 === 12)
      .flatMap((column) =>
        indexes(4)
          .map((offset) => ({
            column: column + offset,
            row: surfaceStartByColumn[column] - 1,
          }))
          .filter(({ column: waterColumn, row }) =>
            isInsideWaterWorld(waterColumn, row, columns, rows),
          )
          .filter(
            ({ column: waterColumn, row }) =>
              !terrainTiles[terrainTileKey(waterColumn, row)],
          )
          .map(({ column: waterColumn, row }) => [
            terrainTileKey(waterColumn, row),
            surfaceWaterLevel,
          ]),
      ),
  ) as WaterTiles;

export const hasWaterUpdateChanges = (update: WaterTilesUpdatePayload) => {
  if (Object.keys(update.waterTiles).length > 0) {
    return true;
  }
  if ((update.removedWaterTiles ?? []).length > 0) {
    return true;
  }
  return Object.keys(update.flowDirections ?? {}).length > 0;
};
