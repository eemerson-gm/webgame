import * as ex from "excalibur";
import { Resources } from "../resource";

export type WorldTerrainPayload = {
  columns: number;
  rows: number;
  surfaceStartByColumn: number[];
};

type TerrainTileMapOptions = {
  pos?: ex.Vector;
  tileWidth: number;
  tileHeight: number;
  renderFromTopOfGraphic?: boolean;
} & WorldTerrainPayload;

type TerrainBorderSegment = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type TerrainBorderOptions = {
  pos: ex.Vector;
  tileWidth: number;
  tileHeight: number;
  columns: number;
  rows: number;
  surfaceStartByColumn: number[];
};

const terrainBorderThickness = 1;

const assertWorldMatchesLayout = (options: TerrainTileMapOptions) => {
  if (options.surfaceStartByColumn.length !== options.columns) {
    throw new Error("TerrainTileMap: surfaceStartByColumn length must equal columns");
  }
};

const terrainGraphicFor = (tile: ex.Tile, surfaceStartByColumn: number[]) => {
  if (tile.y === surfaceStartByColumn[tile.x]) {
    return Resources.Grass.toSprite();
  }
  return Resources.Dirt.toSprite();
};

const indexes = (count: number) => Array.from({ length: count }, (_, index) => index);

const isSolidTerrainTile = (
  column: number,
  row: number,
  columns: number,
  rows: number,
  surfaceStartByColumn: number[],
) => {
  if (column < 0 || column >= columns) {
    return false;
  }
  if (row < 0 || row >= rows) {
    return false;
  }
  return row >= surfaceStartByColumn[column];
};

const borderSegmentsForTile = (
  column: number,
  row: number,
  options: TerrainBorderOptions,
) => {
  const { tileWidth, tileHeight, columns, rows, surfaceStartByColumn } = options;
  const x = column * tileWidth;
  const y = row * tileHeight;
  const above = isSolidTerrainTile(column, row - 1, columns, rows, surfaceStartByColumn);
  const left = isSolidTerrainTile(column - 1, row, columns, rows, surfaceStartByColumn);
  const right = isSolidTerrainTile(column + 1, row, columns, rows, surfaceStartByColumn);
  const below = isSolidTerrainTile(column, row + 1, columns, rows, surfaceStartByColumn);

  return [
    above ? [] : [{ x, y, width: tileWidth, height: terrainBorderThickness }],
    left ? [] : [{ x, y, width: terrainBorderThickness, height: tileHeight }],
    right
      ? []
      : [{ x: x + tileWidth - terrainBorderThickness, y, width: terrainBorderThickness, height: tileHeight }],
    below
      ? []
      : [{ x, y: y + tileHeight - terrainBorderThickness, width: tileWidth, height: terrainBorderThickness }],
  ].flat();
};

const terrainBorderSegments = (options: TerrainBorderOptions) => {
  const { columns, rows, surfaceStartByColumn } = options;

  return indexes(columns).flatMap((column) =>
    indexes(rows)
      .filter((row) => isSolidTerrainTile(column, row, columns, rows, surfaceStartByColumn))
      .flatMap((row) => borderSegmentsForTile(column, row, options)),
  );
};

const createBorderGraphic = (segments: TerrainBorderSegment[]) =>
  new ex.GraphicsGroup({
    members: segments.map((segment) => ({
      graphic: new ex.Rectangle({
        width: segment.width,
        height: segment.height,
        color: ex.Color.Black,
      }),
      offset: ex.vec(segment.x, segment.y),
    })),
  });

const createTerrainBorder = (options: TerrainBorderOptions) => {
  const border = new ex.Actor({
    pos: options.pos,
    anchor: ex.vec(0, 0),
  });

  border.graphics.anchor = ex.vec(0, 0);
  border.graphics.use(createBorderGraphic(terrainBorderSegments(options)));
  return border;
};

export class TerrainTileMap {
  public readonly map: ex.TileMap;
  public readonly border: ex.Actor;

  constructor(options: TerrainTileMapOptions) {
    const {
      pos = ex.vec(0, 0),
      tileWidth,
      tileHeight,
      columns,
      rows,
      surfaceStartByColumn,
      renderFromTopOfGraphic = true,
    } = options;

    assertWorldMatchesLayout(options);

    this.map = new ex.TileMap({
      pos,
      tileWidth,
      tileHeight,
      columns,
      rows,
      renderFromTopOfGraphic,
    });

    this.map.tiles.forEach((tile) => {
      if (tile.y >= surfaceStartByColumn[tile.x]) {
        tile.addGraphic(terrainGraphicFor(tile, surfaceStartByColumn));
      }
    });

    this.border = createTerrainBorder({
      pos,
      tileWidth,
      tileHeight,
      columns,
      rows,
      surfaceStartByColumn,
    });
  }
}
