import * as ex from "excalibur";
import type { TerrainTileKind } from "./GameProtocol";
import { TerrainBorderRaster, type TerrainBorderSegment } from "./TerrainBorderRaster";
import { terrainTileKey } from "../world/terrainTiles";

const terrainBorderThickness = 1;
const terrainChunkSize = 16;

const indexes = (count: number) => Array.from({ length: count }, (_, index) => index);
export const chunkKey = (chunkColumn: number, chunkRow: number) => `${chunkColumn},${chunkRow}`;
export const chunkStartTile = (chunkIndex: number) => chunkIndex * terrainChunkSize;
export const chunkCount = (tiles: number) => Math.ceil(tiles / terrainChunkSize);
export const chunkIndexForTile = (tile: number) => Math.floor(tile / terrainChunkSize);

type TerrainBorderOptions = {
  tileWidth: number;
  tileHeight: number;
  columns: number;
  rows: number;
  solidTiles: Set<string>;
  terrainTiles: Record<string, TerrainTileKind>;
  chunkColumn: number;
  chunkRow: number;
};

export const isInsideTerrain = (column: number, row: number, columns: number, rows: number) => {
  if (column < 0 || column >= columns) {
    return false;
  }
  if (row < 0 || row >= rows) {
    return false;
  }
  return true;
};

export const isSolidTerrainTile = (
  column: number,
  row: number,
  columns: number,
  rows: number,
  solidTiles: Set<string>,
) => {
  if (!isInsideTerrain(column, row, columns, rows)) {
    return false;
  }
  return solidTiles.has(terrainTileKey(column, row));
};

const borderSegmentsForTile = (
  column: number,
  row: number,
  options: TerrainBorderOptions,
) => {
  const { tileWidth, tileHeight, columns, rows, solidTiles, chunkColumn, chunkRow, terrainTiles } = options;
  const x = (column - chunkStartTile(chunkColumn)) * tileWidth;
  const y = (row - chunkStartTile(chunkRow)) * tileHeight;
  
  const isVisualSolid = (c: number, r: number) => {
    if (!isSolidTerrainTile(c, r, columns, rows, solidTiles)) {
      return false;
    }
    const key = terrainTileKey(c, r);
    return terrainTiles[key] !== "mushroom";
  };

  const above = isVisualSolid(column, row - 1);
  const left = isVisualSolid(column - 1, row);
  const right = isVisualSolid(column + 1, row);
  const below = isVisualSolid(column, row + 1);

  return [
    above
      ? []
      : [{ width: tileWidth, height: terrainBorderThickness, offsetX: x, offsetY: y }],
    left
      ? []
      : [{ width: terrainBorderThickness, height: tileHeight, offsetX: x, offsetY: y }],
    right
      ? []
      : [
          {
            width: terrainBorderThickness,
            height: tileHeight,
            offsetX: x + tileWidth - terrainBorderThickness,
            offsetY: y,
          },
        ],
    below
      ? []
      : [
          {
            width: tileWidth,
            height: terrainBorderThickness,
            offsetX: x,
            offsetY: y + tileHeight - terrainBorderThickness,
          },
        ],
  ].flat();
};

const chunkTileRange = (chunkIndex: number, totalTiles: number) => {
  const start = chunkStartTile(chunkIndex);
  const count = Math.min(terrainChunkSize, totalTiles - start);
  return indexes(count).map((index) => start + index);
};

const terrainBorderSegmentsForChunk = (options: TerrainBorderOptions) => {
  const { columns, rows, solidTiles, chunkColumn, chunkRow, terrainTiles } = options;

  return chunkTileRange(chunkColumn, columns).flatMap((column) =>
    chunkTileRange(chunkRow, rows)
      .filter((row) => {
        if (!isSolidTerrainTile(column, row, columns, rows, solidTiles)) {
          return false;
        }
        const key = terrainTileKey(column, row);
        return terrainTiles[key] !== "mushroom";
      })
      .flatMap((row) => borderSegmentsForTile(column, row, options)),
  );
};

const createBorderGraphic = (
  tileWidth: number,
  tileHeight: number,
  segments: TerrainBorderSegment[],
) =>
  new TerrainBorderRaster(terrainChunkSize * tileWidth, terrainChunkSize * tileHeight, segments);

const createBorderActor = (
  pos: ex.Vector,
  tileWidth: number,
  tileHeight: number,
  chunkColumn: number,
  chunkRow: number,
  graphic: TerrainBorderRaster,
) => {
  const border = new ex.Actor({
    pos: ex.vec(
      pos.x + chunkStartTile(chunkColumn) * tileWidth,
      pos.y + chunkStartTile(chunkRow) * tileHeight,
    ),
    anchor: ex.vec(0, 0),
  });

  border.graphics.anchor = ex.vec(0, 0);
  border.graphics.use(graphic);
  return border;
};

export const adjacentTilePositions = (column: number, row: number) =>
  [
    [column, row],
    [column - 1, row],
    [column + 1, row],
    [column, row - 1],
    [column, row + 1],
  ];

export const adjacentChunkKeysForTile = (column: number, row: number, columns: number, rows: number) =>
  adjacentTilePositions(column, row)
    .filter(([neighborColumn, neighborRow]) =>
      isInsideTerrain(neighborColumn, neighborRow, columns, rows),
    )
    .map(([neighborColumn, neighborRow]) =>
      chunkKey(chunkIndexForTile(neighborColumn), chunkIndexForTile(neighborRow)),
    )
    .filter((key, index, keys) => keys.indexOf(key) === index);

const parseChunkKey = (key: string) => key.split(",").map(Number);

export class TerrainBorderManager {
  private readonly borderActorsByChunkKey: Record<string, ex.Actor> = {};

  constructor(
    private readonly pos: ex.Vector,
    private readonly tileWidth: number,
    private readonly tileHeight: number,
    private readonly columns: number,
    private readonly rows: number,
    private readonly solidTiles: Set<string>,
    private readonly terrainTiles: Record<string, TerrainTileKind>
  ) {}

  public createAllBorderActors(): ex.Actor[] {
    return indexes(chunkCount(this.columns)).flatMap((chunkColumn) =>
      indexes(chunkCount(this.rows)).map((chunkRow) =>
        this.createBorderActorForChunk(chunkColumn, chunkRow),
      ),
    );
  }

  private createBorderActorForChunk(chunkColumn: number, chunkRow: number) {
    const key = chunkKey(chunkColumn, chunkRow);
    const actor = createBorderActor(
      this.pos,
      this.tileWidth,
      this.tileHeight,
      chunkColumn,
      chunkRow,
      this.createBorderGraphicForChunk(chunkColumn, chunkRow),
    );
    this.borderActorsByChunkKey[key] = actor;
    return actor;
  }

  private createBorderGraphicForChunk(chunkColumn: number, chunkRow: number) {
    return createBorderGraphic(
      this.tileWidth,
      this.tileHeight,
      terrainBorderSegmentsForChunk({
        tileWidth: this.tileWidth,
        tileHeight: this.tileHeight,
        columns: this.columns,
        rows: this.rows,
        solidTiles: this.solidTiles,
        terrainTiles: this.terrainTiles,
        chunkColumn,
        chunkRow,
      }),
    );
  }

  public rebuildBorderChunk(key: string) {
    const actor = this.borderActorsByChunkKey[key];
    if (!actor) {
      return;
    }
    const [chunkColumn, chunkRow] = parseChunkKey(key);
    actor.graphics.use(this.createBorderGraphicForChunk(chunkColumn, chunkRow));
  }
}
