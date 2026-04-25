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

const assertWorldMatchesLayout = (options: TerrainTileMapOptions) => {
  if (options.surfaceStartByColumn.length !== options.columns) {
    throw new Error("TerrainTileMap: surfaceStartByColumn length must equal columns");
  }
};

export class TerrainTileMap {
  public readonly map: ex.TileMap;

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
        tile.addGraphic(Resources.Block.toSprite());
      }
    });
  }
}
