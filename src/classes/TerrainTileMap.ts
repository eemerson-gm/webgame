import * as ex from "excalibur";
import { Resources } from "../resource";
import type {
  TerrainBlockUpdate,
  TerrainTileKind,
  WorldTerrainPayload,
} from "./GameProtocol";
import {
  buildTerrainTilesFromSurface,
  terrainTileKey,
} from "../world/terrainTiles";
import { TerrainBorderRaster } from "./TerrainBorderRaster";
import type { TerrainBorderSegment } from "./TerrainBorderRaster";

type TerrainTileMapOptions = {
  pos?: ex.Vector;
  tileWidth: number;
  tileHeight: number;
  renderFromTopOfGraphic?: boolean;
} & WorldTerrainPayload;

type TerrainBorderOptions = {
  tileWidth: number;
  tileHeight: number;
  columns: number;
  rows: number;
  solidTiles: Set<string>;
  chunkColumn: number;
  chunkRow: number;
};

const terrainBorderThickness = 1;
const terrainChunkSize = 16;

const assertWorldMatchesLayout = (options: TerrainTileMapOptions) => {
  if (options.surfaceStartByColumn.length !== options.columns) {
    throw new Error("TerrainTileMap: surfaceStartByColumn length must equal columns");
  }
};

const indexes = (count: number) => Array.from({ length: count }, (_, index) => index);
const chunkKey = (chunkColumn: number, chunkRow: number) => `${chunkColumn},${chunkRow}`;
const chunkStartTile = (chunkIndex: number) => chunkIndex * terrainChunkSize;
const chunkCount = (tiles: number) => Math.ceil(tiles / terrainChunkSize);
const chunkIndexForTile = (tile: number) => Math.floor(tile / terrainChunkSize);

const initialTerrainTiles = (options: TerrainTileMapOptions) =>
  options.terrainTiles ??
  buildTerrainTilesFromSurface(options.columns, options.rows, options.surfaceStartByColumn);

const initialSolidTiles = (
  options: TerrainTileMapOptions,
  terrainTiles: Record<string, TerrainTileKind>,
) => new Set(options.solidTiles ?? Object.keys(terrainTiles));

const isInsideTerrain = (column: number, row: number, columns: number, rows: number) => {
  if (column < 0 || column >= columns) {
    return false;
  }
  if (row < 0 || row >= rows) {
    return false;
  }
  return true;
};

const isSolidTerrainTile = (
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

const terrainGraphicFor = (
  column: number,
  row: number,
  terrainTiles: Record<string, TerrainTileKind>,
) => {
  const kind = terrainTiles[terrainTileKey(column, row)];
  if (kind === "bedrock") {
    return Resources.Bedrock.toSprite();
  }
  if (kind === "grass") {
    return Resources.Grass.toSprite();
  }
  if (kind === "stone") {
    return Resources.Stone.toSprite();
  }
  return Resources.Dirt.toSprite();
};

const borderSegmentsForTile = (
  column: number,
  row: number,
  options: TerrainBorderOptions,
) => {
  const { tileWidth, tileHeight, columns, rows, solidTiles, chunkColumn, chunkRow } = options;
  const x = (column - chunkStartTile(chunkColumn)) * tileWidth;
  const y = (row - chunkStartTile(chunkRow)) * tileHeight;
  const above = isSolidTerrainTile(column, row - 1, columns, rows, solidTiles);
  const left = isSolidTerrainTile(column - 1, row, columns, rows, solidTiles);
  const right = isSolidTerrainTile(column + 1, row, columns, rows, solidTiles);
  const below = isSolidTerrainTile(column, row + 1, columns, rows, solidTiles);

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
  const { columns, rows, solidTiles, chunkColumn, chunkRow } = options;

  return chunkTileRange(chunkColumn, columns).flatMap((column) =>
    chunkTileRange(chunkRow, rows)
      .filter((row) => isSolidTerrainTile(column, row, columns, rows, solidTiles))
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

const adjacentChunkKeysForTile = (column: number, row: number, columns: number, rows: number) =>
  adjacentTilePositions(column, row)
    .filter(([neighborColumn, neighborRow]) =>
      isInsideTerrain(neighborColumn, neighborRow, columns, rows),
    )
    .map(([neighborColumn, neighborRow]) =>
      chunkKey(chunkIndexForTile(neighborColumn), chunkIndexForTile(neighborRow)),
    )
    .filter((key, index, keys) => keys.indexOf(key) === index);

const adjacentTilePositions = (column: number, row: number) =>
  [
    [column, row],
    [column - 1, row],
    [column + 1, row],
    [column, row - 1],
    [column, row + 1],
  ];

const parseChunkKey = (key: string) => key.split(",").map(Number);

export class TerrainTileMap {
  public readonly map: ex.TileMap;
  public readonly borders: ex.Actor[];
  private readonly pos: ex.Vector;
  private readonly tileWidth: number;
  private readonly tileHeight: number;
  private readonly columns: number;
  private readonly rows: number;
  private readonly solidTiles: Set<string>;
  private readonly terrainTiles: Record<string, TerrainTileKind>;
  private readonly borderActorsByChunkKey: Record<string, ex.Actor>;

  constructor(options: TerrainTileMapOptions) {
    const {
      pos = ex.vec(0, 0),
      tileWidth,
      tileHeight,
      columns,
      rows,
      renderFromTopOfGraphic = true,
    } = options;

    assertWorldMatchesLayout(options);
    this.pos = pos;
    this.tileWidth = tileWidth;
    this.tileHeight = tileHeight;
    this.columns = columns;
    this.rows = rows;
    const terrainTiles = initialTerrainTiles(options);
    this.terrainTiles = terrainTiles;
    this.solidTiles = initialSolidTiles(options, terrainTiles);
    this.borderActorsByChunkKey = {};

    this.map = new ex.TileMap({
      pos,
      tileWidth,
      tileHeight,
      columns,
      rows,
      renderFromTopOfGraphic,
    });

    this.map.tiles.forEach((tile) => this.syncTileGraphic(tile.x, tile.y));
    this.borders = this.createAllBorderActors();
  }

  public removeBlock(column: number, row: number) {
    this.setBlockSolid(column, row, false);
  }

  public applyBlockUpdate(update: TerrainBlockUpdate) {
    this.setBlockSolid(update.column, update.row, update.solid, update.kind);
  }

  public setBlockSolid(
    column: number,
    row: number,
    solid: boolean,
    kind: TerrainTileKind = "dirt",
  ) {
    if (!isInsideTerrain(column, row, this.columns, this.rows)) {
      return;
    }
    const key = terrainTileKey(column, row);
    if (solid) {
      this.solidTiles.add(key);
      this.terrainTiles[key] = kind;
    }
    if (!solid) {
      this.solidTiles.delete(key);
      delete this.terrainTiles[key];
    }
    this.syncTileNeighborhood(column, row);
    adjacentChunkKeysForTile(column, row, this.columns, this.rows).forEach((chunk) =>
      this.rebuildBorderChunk(chunk),
    );
  }

  private syncTileNeighborhood(column: number, row: number) {
    adjacentTilePositions(column, row)
      .filter(([neighborColumn, neighborRow]) =>
        isInsideTerrain(neighborColumn, neighborRow, this.columns, this.rows),
      )
      .forEach(([neighborColumn, neighborRow]) =>
        this.syncTileGraphic(neighborColumn, neighborRow),
      );
  }

  private syncTileGraphic(column: number, row: number) {
    const tile = this.map.getTile(column, row);
    if (!tile) {
      return;
    }
    tile.clearGraphics();
    if (!isSolidTerrainTile(column, row, this.columns, this.rows, this.solidTiles)) {
      return;
    }
    tile.addGraphic(
      terrainGraphicFor(column, row, this.terrainTiles),
    );
  }

  private createAllBorderActors() {
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
        chunkColumn,
        chunkRow,
      }),
    );
  }

  private rebuildBorderChunk(key: string) {
    const actor = this.borderActorsByChunkKey[key];
    if (!actor) {
      return;
    }
    const [chunkColumn, chunkRow] = parseChunkKey(key);
    actor.graphics.use(this.createBorderGraphicForChunk(chunkColumn, chunkRow));
  }
}
