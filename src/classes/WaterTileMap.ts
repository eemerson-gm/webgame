import * as ex from "excalibur";
import type {
  WaterFlowDirection,
  WaterTiles,
  WaterTilesUpdatePayload,
} from "./GameProtocol";
import { terrainTileKey } from "../world/terrainTiles";

type WaterTileMapOptions = {
  pos?: ex.Vector;
  tileWidth: number;
  tileHeight: number;
  columns: number;
  rows: number;
  waterTiles?: WaterTiles;
  waterFlowDirections?: Record<string, WaterFlowDirection>;
};

export type WaterTileSnapshot = {
  tileWidth: number;
  tileHeight: number;
  columns: number;
  rows: number;
  waterTiles: WaterTiles;
  flowDirections: Record<string, WaterFlowDirection>;
};

const isInsideWaterMap = (
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

const waterLevelFrom = (level: unknown) => {
  const value = Number(level);
  if (!Number.isInteger(value)) {
    return null;
  }
  if (value <= 0 || value > 16) {
    return null;
  }
  return value;
};

export class WaterTileMap {
  public readonly pos: ex.Vector;
  private readonly tileWidth: number;
  private readonly tileHeight: number;
  private readonly columns: number;
  private readonly rows: number;
  private readonly waterTiles: WaterTiles;
  private readonly flowDirections: Record<string, WaterFlowDirection>;
  private changeRevision: number = 0;

  constructor(options: WaterTileMapOptions) {
    const {
      pos = ex.vec(0, 0),
      tileWidth,
      tileHeight,
      columns,
      rows,
      waterTiles = {},
      waterFlowDirections = {},
    } = options;
    this.pos = pos;
    this.tileWidth = tileWidth;
    this.tileHeight = tileHeight;
    this.columns = columns;
    this.rows = rows;
    this.waterTiles = {};
    this.flowDirections = { ...waterFlowDirections };
    Object.entries(waterTiles).forEach(([key, level]) =>
      this.rememberWaterLevelByKey(key, level),
    );
  }

  public applyWaterUpdate(update: WaterTilesUpdatePayload) {
    Object.entries(update.flowDirections ?? {}).forEach(([key, direction]) => {
      this.flowDirections[key] = direction;
    });
    Object.entries(update.waterTiles).forEach(([key, level]) =>
      this.setWaterLevelByKey(key, level),
    );
    (update.removedWaterTiles ?? []).forEach((key) =>
      this.removeWaterLevelByKey(key),
    );
    this.changeRevision += 1;
  }

  public revision() {
    return this.changeRevision;
  }

  public snapshot(): WaterTileSnapshot {
    return {
      tileWidth: this.tileWidth,
      tileHeight: this.tileHeight,
      columns: this.columns,
      rows: this.rows,
      waterTiles: { ...this.waterTiles },
      flowDirections: { ...this.flowDirections },
    };
  }

  public isInside(column: number, row: number) {
    return isInsideWaterMap(column, row, this.columns, this.rows);
  }

  public waterLevelAt(column: number, row: number) {
    if (!this.isInside(column, row)) {
      return 0;
    }
    return this.waterTiles[terrainTileKey(column, row)] ?? 0;
  }

  public isWaterAt(column: number, row: number) {
    return this.waterLevelAt(column, row) > 0;
  }

  public tilePositionAt(worldPos: ex.Vector) {
    return {
      column: Math.floor((worldPos.x - this.pos.x) / this.tileWidth),
      row: Math.floor((worldPos.y - this.pos.y) / this.tileHeight),
    };
  }

  public waterTilesTouchingBounds(bounds: {
    left: number;
    right: number;
    top: number;
    bottom: number;
  }) {
    const leftColumn = Math.floor((bounds.left - this.pos.x) / this.tileWidth);
    const rightColumn = Math.floor((bounds.right - this.pos.x) / this.tileWidth);
    const topRow = Math.floor((bounds.top - this.pos.y) / this.tileHeight);
    const bottomRow = Math.floor((bounds.bottom - this.pos.y) / this.tileHeight);
    return [
      [leftColumn, topRow],
      [rightColumn, topRow],
      [leftColumn, bottomRow],
      [rightColumn, bottomRow],
    ].some(([column, row]) => this.isWaterAt(column, row));
  }

  private setWaterLevelByKey(key: string, level: unknown) {
    this.rememberWaterLevelByKey(key, level);
  }

  private rememberWaterLevelByKey(key: string, level: unknown) {
    const position = this.positionFromKey(key);
    const waterLevel = waterLevelFrom(level);
    if (!position || !waterLevel) {
      return false;
    }
    this.waterTiles[key] = waterLevel;
    return true;
  }

  private removeWaterLevelByKey(key: string) {
    const position = this.positionFromKey(key);
    if (!position) {
      return;
    }
    delete this.waterTiles[key];
    delete this.flowDirections[key];
  }

  private positionFromKey(key: string) {
    const [column, row] = key.split(",").map(Number);
    if (!Number.isInteger(column) || !Number.isInteger(row)) {
      return null;
    }
    if (!isInsideWaterMap(column, row, this.columns, this.rows)) {
      return null;
    }
    return { column, row };
  }
}
