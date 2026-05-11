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
import type { TileCollisionWorld } from "../actors/MovingActor";
import {
  TerrainBorderManager,
  adjacentTilePositions,
  adjacentChunkKeysForTile,
  chunkCount,
  chunkIndexForTile,
  chunkKey,
  chunkStartTile,
  isInsideTerrain,
} from "./TerrainBorderManager";
import { TerrainTileGrid } from "./TerrainTileGrid";

type TerrainTileMapOptions = {
  pos?: ex.Vector;
  tileWidth: number;
  tileHeight: number;
  renderFromTopOfGraphic?: boolean;
  viewSize?: ex.Vector;
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
type TerrainChunk = {
  tilemap: ex.TileMap;
  border: ex.Actor;
};
type TileBounds = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

const visibleChunkPadding = 1;
const defaultViewSize = ex.vec(320, 180);
const indexes = (count: number) => Array.from({ length: count }, (_, index) => index);

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
  terrainTiles: TerrainTileGrid,
) => {
  const kind = terrainTiles.kindAt(column, row) ?? "dirt";
  return terrainBlockForKind(kind).toGraphic();
};

const tileBoundsForView = (
  terrain: TerrainTileMap,
  camera: ex.Camera,
  viewSize: ex.Vector,
): TileBounds => ({
  left: Math.max(
    Math.floor((camera.pos.x - viewSize.x / 2) / terrain.tileWidthPx()) - 1,
    0,
  ),
  right: Math.min(
    Math.floor((camera.pos.x + viewSize.x / 2) / terrain.tileWidthPx()) + 1,
    terrain.columnCount() - 1,
  ),
  top: Math.max(
    Math.floor((camera.pos.y - viewSize.y / 2) / terrain.tileHeightPx()) - 1,
    0,
  ),
  bottom: Math.min(
    Math.floor((camera.pos.y + viewSize.y / 2) / terrain.tileHeightPx()) + 1,
    terrain.rowCount() - 1,
  ),
});

const chunkKeysForTileBounds = (bounds: TileBounds) => {
  const left = Math.max(chunkIndexForTile(bounds.left) - visibleChunkPadding, 0);
  const right = chunkIndexForTile(bounds.right) + visibleChunkPadding;
  const top = Math.max(chunkIndexForTile(bounds.top) - visibleChunkPadding, 0);
  const bottom = chunkIndexForTile(bounds.bottom) + visibleChunkPadding;
  return indexes(right - left + 1).flatMap((columnOffset) =>
    indexes(bottom - top + 1).map((rowOffset) =>
      chunkKey(left + columnOffset, top + rowOffset),
    ),
  );
};

const chunkTileCount = (chunkIndex: number, totalTiles: number) =>
  Math.min(chunkStartTile(chunkIndex + 1) - chunkStartTile(chunkIndex), totalTiles - chunkStartTile(chunkIndex));

const parseChunkKey = (key: string) => key.split(",").map(Number);

class TerrainChunkRenderer extends ex.Actor {
  private readonly activeChunks = new Map<string, TerrainChunk>();

  constructor(
    private readonly terrain: TerrainTileMap,
    private readonly viewSize: ex.Vector,
  ) {
    super({ pos: ex.vec(0, 0), anchor: ex.vec(0, 0) });
  }

  override onPostUpdate(engine: ex.Engine) {
    this.syncVisibleChunks(engine.currentScene, engine.currentScene.camera);
  }

  public syncTileNeighborhood(column: number, row: number) {
    adjacentTilePositions(column, row)
      .filter(([neighborColumn, neighborRow]) =>
        isInsideTerrain(
          neighborColumn,
          neighborRow,
          this.terrain.columnCount(),
          this.terrain.rowCount(),
        ),
      )
      .forEach(([neighborColumn, neighborRow]) =>
        this.syncTileGraphic(neighborColumn, neighborRow),
      );
  }

  public rebuildBorderChunks(keys: string[]) {
    keys.forEach((key) => {
      const chunk = this.activeChunks.get(key);
      if (!chunk) {
        return;
      }
      const [chunkColumn, chunkRow] = parseChunkKey(key);
      chunk.border.graphics.use(this.terrain.borderGraphicForChunk(chunkColumn, chunkRow));
    });
  }

  private syncVisibleChunks(scene: ex.Scene, camera: ex.Camera) {
    const visibleKeys = new Set(
      chunkKeysForTileBounds(tileBoundsForView(this.terrain, camera, this.viewSize))
        .filter((key) => this.terrain.isChunkInside(key)),
    );
    this.activeChunks.forEach((chunk, key) => {
      if (visibleKeys.has(key)) {
        return;
      }
      chunk.tilemap.kill();
      chunk.border.kill();
      this.activeChunks.delete(key);
    });
    visibleKeys.forEach((key) => {
      if (this.activeChunks.has(key)) {
        return;
      }
      const chunk = this.terrain.createRenderChunk(key);
      this.activeChunks.set(key, chunk);
      scene.add(chunk.tilemap);
      scene.add(chunk.border);
    });
  }

  private syncTileGraphic(column: number, row: number) {
    const chunk = this.activeChunks.get(
      chunkKey(chunkIndexForTile(column), chunkIndexForTile(row)),
    );
    if (!chunk) {
      return;
    }
    this.terrain.syncRenderTileGraphic(
      chunk.tilemap,
      column - chunkStartTile(chunkIndexForTile(column)),
      row - chunkStartTile(chunkIndexForTile(row)),
      column,
      row,
    );
  }
}

export class TerrainTileMap {
  public readonly map: ex.TileMap;
  public readonly renderer: ex.Actor;
  private readonly pos: ex.Vector;
  private readonly tileWidth: number;
  private readonly tileHeight: number;
  private readonly columns: number;
  private readonly rows: number;
  private readonly renderFromTopOfGraphic: boolean;
  private readonly solidTiles: Set<string>;
  private readonly protectedTiles: Set<string>;
  private readonly terrainTileGrid: TerrainTileGrid;
  private readonly blockChangeHandlers: TerrainChangeHandler[];
  private readonly borderManager: TerrainBorderManager;
  private readonly chunkRenderer: TerrainChunkRenderer;

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
    this.renderFromTopOfGraphic = renderFromTopOfGraphic;
    const terrainTilesRecord = initialTerrainTiles(options);
    this.solidTiles = initialSolidTiles(options, terrainTilesRecord);
    this.terrainTileGrid = new TerrainTileGrid(
      this.columns,
      this.rows,
      terrainTilesRecord,
    );
    void terrainTilesRecord;
    this.protectedTiles = new Set(options.protectedTiles ?? []);
    this.blockChangeHandlers = [];

    this.borderManager = new TerrainBorderManager(
      this.pos,
      this.tileWidth,
      this.tileHeight,
      this.columns,
      this.rows,
      this.solidTiles,
      (column: number, row: number) => this.terrainTileGrid.kindAt(column, row),
    );

    this.map = new ex.TileMap({
      pos,
      tileWidth,
      tileHeight,
      columns,
      rows,
      renderFromTopOfGraphic,
    });

    this.chunkRenderer = new TerrainChunkRenderer(
      this,
      options.viewSize ?? defaultViewSize,
    );
    this.renderer = this.chunkRenderer;
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
    return this.terrainTileGrid.kindAt(column, row);
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
      this.terrainTileGrid.setKindAt(column, row, kind);
    }
    if (!solid) {
      this.solidTiles.delete(key);
      this.terrainTileGrid.clearKindAt(column, row);
    }
    this.syncTileNeighborhood(column, row);
    this.chunkRenderer.rebuildBorderChunks(
      adjacentChunkKeysForTile(column, row, this.columns, this.rows),
    );
    this.emitBlocksChanged({ column, row });
  }

  public isChunkInside(key: string) {
    const [chunkColumn, chunkRow] = parseChunkKey(key);
    if (chunkColumn < 0 || chunkColumn >= chunkCount(this.columns)) {
      return false;
    }
    return chunkRow >= 0 && chunkRow < chunkCount(this.rows);
  }

  public createRenderChunk(key: string): TerrainChunk {
    const [chunkColumn, chunkRow] = parseChunkKey(key);
    const startColumn = chunkStartTile(chunkColumn);
    const startRow = chunkStartTile(chunkRow);
    const tilemap = new ex.TileMap({
      pos: ex.vec(
        this.pos.x + startColumn * this.tileWidth,
        this.pos.y + startRow * this.tileHeight,
      ),
      tileWidth: this.tileWidth,
      tileHeight: this.tileHeight,
      columns: chunkTileCount(chunkColumn, this.columns),
      rows: chunkTileCount(chunkRow, this.rows),
      renderFromTopOfGraphic: this.renderFromTopOfGraphic,
    });
    tilemap.tiles.forEach((tile) =>
      this.syncRenderTileGraphic(
        tilemap,
        tile.x,
        tile.y,
        startColumn + tile.x,
        startRow + tile.y,
      ),
    );
    return {
      tilemap,
      border: this.borderManager.createBorderActorForChunk(chunkColumn, chunkRow),
    };
  }

  public borderGraphicForChunk(chunkColumn: number, chunkRow: number) {
    return this.borderManager.createBorderGraphicForChunk(chunkColumn, chunkRow);
  }

  public syncRenderTileGraphic(
    tilemap: ex.TileMap,
    localColumn: number,
    localRow: number,
    column: number,
    row: number,
  ) {
    const tile = tilemap.getTile(localColumn, localRow);
    if (!tile) {
      return;
    }
    tile.clearGraphics();
    if (!this.terrainTileGrid.kindAt(column, row)) {
      return;
    }
    tile.addGraphic(terrainGraphicFor(column, row, this.terrainTileGrid));
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
    this.chunkRenderer.syncTileNeighborhood(column, row);
  }
}
