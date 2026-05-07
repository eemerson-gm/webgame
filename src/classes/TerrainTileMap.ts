import * as ex from "excalibur";
import type {
  TerrainBlockUpdate,
  TerrainTileKind,
} from "./GameProtocol";
import { terrainBlockForKind } from "./TerrainBlock";
import {
  buildTerrainTilesFromSurface,
  terrainTileKey,
} from "../world/terrainTiles";
import { solidTerrainTileKeys } from "./TerrainTileKinds";
import type { TileCollisionWorld } from "../simulation/entityPhysics";
import { TerrainBorderManager, adjacentTilePositions, adjacentChunkKeysForTile, isInsideTerrain } from "./TerrainBorderManager";

type TerrainTileMapOptions = {
  pos?: ex.Vector;
  tileWidth: number;
  tileHeight: number;
  renderFromTopOfGraphic?: boolean;
  columns: number;
  rows: number;
  surfaceStartByColumn: number[];
  solidTiles?: string[];
  protectedTiles?: string[];
  terrainTiles?: Record<string, TerrainTileKind>;
};

export type TerrainChange = {
  column: number;
  row: number;
};

type TerrainChangeHandler = (change: TerrainChange) => void;

const assertWorldMatchesLayout = (options: TerrainTileMapOptions) => {
  if (options.surfaceStartByColumn.length !== options.columns) {
    throw new Error("TerrainTileMap: surfaceStartByColumn length must equal columns");
  }
};

const initialTerrainTiles = (options: TerrainTileMapOptions) =>
  options.terrainTiles ??
  buildTerrainTilesFromSurface(options.columns, options.rows, options.surfaceStartByColumn);

const initialSolidTiles = (
  options: TerrainTileMapOptions,
  terrainTiles: Record<string, TerrainTileKind>,
) => new Set(options.solidTiles ?? solidTerrainTileKeys(terrainTiles));

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
  const kind = terrainTiles[terrainTileKey(column, row)] ?? "dirt";
  return terrainBlockForKind(kind).toGraphic();
};

export class TerrainTileMap {
  public readonly map: ex.TileMap;
  public readonly borders: ex.Actor[];
  private readonly pos: ex.Vector;
  private readonly tileWidth: number;
  private readonly tileHeight: number;
  private readonly columns: number;
  private readonly rows: number;
  private readonly solidTiles: Set<string>;
  private readonly protectedTiles: Set<string>;
  private readonly terrainTiles: Record<string, TerrainTileKind>;
  private readonly blockChangeHandlers: TerrainChangeHandler[];
  private readonly borderManager: TerrainBorderManager;

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
    this.protectedTiles = new Set(options.protectedTiles ?? []);
    this.blockChangeHandlers = [];

    this.borderManager = new TerrainBorderManager(
      this.pos,
      this.tileWidth,
      this.tileHeight,
      this.columns,
      this.rows,
      this.solidTiles,
      this.terrainTiles
    );

    this.map = new ex.TileMap({
      pos,
      tileWidth,
      tileHeight,
      columns,
      rows,
      renderFromTopOfGraphic,
    });

    this.map.tiles.forEach((tile) => this.syncTileGraphic(tile.x, tile.y));
    this.borders = this.borderManager.createAllBorderActors();
  }

  public removeBlock(column: number, row: number) {
    this.setBlockSolid(column, row, false);
  }

  public onBlocksChanged(handler: TerrainChangeHandler) {
    this.blockChangeHandlers.push(handler);
  }

  public origin() {
    return this.pos.clone();
  }

  public columnCount() {
    return this.columns;
  }

  public rowCount() {
    return this.rows;
  }

  public tileWidthPx() {
    return this.tileWidth;
  }

  public tileHeightPx() {
    return this.tileHeight;
  }

  public worldWidth() {
    return this.columns * this.tileWidth;
  }

  public worldHeight() {
    return this.rows * this.tileHeight;
  }

  public isInside(column: number, row: number) {
    return isInsideTerrain(column, row, this.columns, this.rows);
  }

  public isSolidAt(column: number, row: number) {
    return isSolidTerrainTile(column, row, this.columns, this.rows, this.solidTiles);
  }

  public isProtectedAt(column: number, row: number) {
    if (!isInsideTerrain(column, row, this.columns, this.rows)) {
      return false;
    }
    return this.protectedTiles.has(terrainTileKey(column, row));
  }

  public tileCollisionWorld(): TileCollisionWorld {
    return {
      tileWidth: this.tileWidth,
      tileHeight: this.tileHeight,
      columns: this.columns,
      rows: this.rows,
      isSolidTile: (column, row) => this.isSolidCollisionTile(column, row),
    };
  }

  public tileKindAt(column: number, row: number) {
    if (!isInsideTerrain(column, row, this.columns, this.rows)) {
      return null;
    }
    return this.terrainTiles[terrainTileKey(column, row)] ?? null;
  }

  public blockAt(column: number, row: number) {
    const kind = this.tileKindAt(column, row);
    if (!kind) {
      return null;
    }
    return terrainBlockForKind(kind);
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
    if (solid && this.isProtectedAt(column, row)) {
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
      this.borderManager.rebuildBorderChunk(chunk),
    );
    this.emitBlocksChanged({ column, row });
  }

  private emitBlocksChanged(change: TerrainChange) {
    this.blockChangeHandlers.forEach((handler) => handler(change));
  }

  private isSolidCollisionTile(column: number, row: number) {
    if (column < 0 || column >= this.columns) {
      return true;
    }
    if (row >= this.rows) {
      return true;
    }
    if (row < 0) {
      return false;
    }
    const kind = this.tileKindAt(column, row);
    if (kind === "mushroom") {
      return false;
    }
    return this.isSolidAt(column, row);
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
    if (!this.terrainTiles[terrainTileKey(column, row)]) {
      return;
    }
    tile.addGraphic(
      terrainGraphicFor(column, row, this.terrainTiles),
    );
  }
}
