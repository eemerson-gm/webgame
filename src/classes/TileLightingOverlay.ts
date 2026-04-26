import * as ex from "excalibur";
import type { TerrainTileKind } from "./GameProtocol";
import { TerrainTileMap } from "./TerrainTileMap";
import type { TerrainChange } from "./TerrainTileMap";
import { terrainTileKey } from "../world/terrainTiles";

type TileLightNode = {
  column: number;
  row: number;
  brightness: number;
};

type SunlightState = {
  isBlocked: boolean;
  brightness: number;
  entries: [string, number][];
};

type TileBounds = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

type LightingState = {
  sunlightByTile: Record<string, number>;
  blockLightByTile: Record<string, number>;
  brightnessByTile: Record<string, number>;
  lampKeys: Set<string>;
};

const maxLightLevel = 15;
const maxShadowAlpha = 0.78;
const sunlightSolidDrop = 3;
const sunlightAirDrop = 1;
const lampLightLevel = 14;
const indexes = (count: number) => Array.from({ length: count }, (_, index) => index);
const lightOverlayZ = 1;

const tileKeyFor = (position: { column: number; row: number }) =>
  terrainTileKey(position.column, position.row);

const lightLevelForKind = (kind: TerrainTileKind | null) =>
  kind === "lamp" ? lampLightLevel : 0;

const shadowAlphaFor = (brightness: number) =>
  maxShadowAlpha * (1 - Math.min(Math.max(brightness, 0), maxLightLevel) / maxLightLevel);

const adjacentPositions = (column: number, row: number) => [
  { column: column - 1, row },
  { column: column + 1, row },
  { column, row: row - 1 },
  { column, row: row + 1 },
];

const fullTileBounds = (columns: number, rows: number) => ({
  left: 0,
  right: columns - 1,
  top: 0,
  bottom: rows - 1,
});

const columnBounds = (column: number, rows: number) => ({
  left: column,
  right: column,
  top: 0,
  bottom: rows - 1,
});

const boundsAround = (
  column: number,
  row: number,
  radius: number,
  columns: number,
  rows: number,
) => ({
  left: Math.max(column - radius, 0),
  right: Math.min(column + radius, columns - 1),
  top: Math.max(row - radius, 0),
  bottom: Math.min(row + radius, rows - 1),
});

const expandBounds = (
  bounds: TileBounds,
  amount: number,
  columns: number,
  rows: number,
) => ({
  left: Math.max(bounds.left - amount, 0),
  right: Math.min(bounds.right + amount, columns - 1),
  top: Math.max(bounds.top - amount, 0),
  bottom: Math.min(bounds.bottom + amount, rows - 1),
});

const unionBounds = (first: TileBounds, second: TileBounds) => ({
  left: Math.min(first.left, second.left),
  right: Math.max(first.right, second.right),
  top: Math.min(first.top, second.top),
  bottom: Math.max(first.bottom, second.bottom),
});

const columnsInBounds = (bounds: TileBounds) =>
  indexes(bounds.right - bounds.left + 1).map((index) => bounds.left + index);

const rowsInBounds = (bounds: TileBounds) =>
  indexes(bounds.bottom - bounds.top + 1).map((index) => bounds.top + index);

const positionsInBounds = (bounds: TileBounds) =>
  columnsInBounds(bounds).flatMap((column) =>
    rowsInBounds(bounds).map((row) => ({ column, row })),
  );

const isPositionInBounds = (
  position: { column: number; row: number },
  bounds: TileBounds,
) => {
  if (position.column < bounds.left || position.column > bounds.right) {
    return false;
  }
  return position.row >= bounds.top && position.row <= bounds.bottom;
};

const sunlightEntriesForColumn = (terrain: TerrainTileMap, column: number) =>
  indexes(terrain.rowCount()).reduce<SunlightState>(
    (state, row) => {
      const isSolid = terrain.isSolidAt(column, row);
      const isOpenSky = !state.isBlocked && !isSolid;
      const fadeAmount = isSolid ? sunlightSolidDrop : sunlightAirDrop;
      const brightness = isOpenSky
        ? maxLightLevel
        : Math.max(state.brightness - fadeAmount, 0);
      state.entries.push([terrainTileKey(column, row), brightness]);
      return {
        isBlocked: state.isBlocked || isSolid,
        brightness,
        entries: state.entries,
      };
    },
    { isBlocked: false, brightness: maxLightLevel, entries: [] },
  ).entries;

const sunlightBrightnessByTile = (terrain: TerrainTileMap) =>
  Object.fromEntries(
    indexes(terrain.columnCount()).flatMap((column) =>
      sunlightEntriesForColumn(terrain, column),
    ),
  ) as Record<string, number>;

const lightSourcesForTerrain = (terrain: TerrainTileMap) =>
  indexes(terrain.columnCount()).flatMap((column) =>
    indexes(terrain.rowCount())
      .map((row) => ({
        column,
        row,
        brightness: lightLevelForKind(terrain.tileKindAt(column, row)),
      }))
      .filter(({ brightness }) => brightness > 0),
  );

const lampKeysForTerrain = (terrain: TerrainTileMap) =>
  new Set(lightSourcesForTerrain(terrain).map(tileKeyFor));

const lightSourcesForLampKeys = (lampKeys: Set<string>) =>
  Array.from(lampKeys).map((key) => {
    const [column, row] = key.split(",").map(Number);
    return { column, row, brightness: lampLightLevel };
  });

const neighborLightNode = (
  terrain: TerrainTileMap,
  source: TileLightNode,
  target: { column: number; row: number },
) => {
  const solidDrop = terrain.isSolidAt(target.column, target.row) ? 3 : 1;
  return {
    ...target,
    brightness: source.brightness - solidDrop,
  };
};

const addLightNode = (
  terrain: TerrainTileMap,
  node: TileLightNode,
  brightnessByTile: Record<string, number>,
  queue: TileLightNode[],
  spreadBounds: TileBounds,
) => {
  if (!isPositionInBounds(node, spreadBounds)) {
    return;
  }
  const key = tileKeyFor(node);
  if (node.brightness <= (brightnessByTile[key] ?? 0)) {
    return;
  }
  brightnessByTile[key] = node.brightness;
  queue.push(node);
};

const spreadBlockLightFromQueue = (
  terrain: TerrainTileMap,
  queue: TileLightNode[],
  brightnessByTile: Record<string, number>,
  spreadBounds: TileBounds,
) => {
  const cursor = { index: 0 };
  while (cursor.index < queue.length) {
    const source = queue[cursor.index];
    cursor.index += 1;
    adjacentPositions(source.column, source.row)
      .filter(({ column, row }) => terrain.isInside(column, row))
      .map((target) => neighborLightNode(terrain, source, target))
      .filter(({ brightness }) => brightness > 0)
      .forEach((node) =>
        addLightNode(terrain, node, brightnessByTile, queue, spreadBounds),
      );
  }
  return brightnessByTile;
};

const blockLightBrightnessByTile = (
  terrain: TerrainTileMap,
  lampKeys: Set<string>,
  spreadBounds: TileBounds = fullTileBounds(
    terrain.columnCount(),
    terrain.rowCount(),
  ),
) => {
  const sources = lightSourcesForLampKeys(lampKeys);
  const brightnessByTile: Record<string, number> = {};
  const queue: TileLightNode[] = [];
  sources.forEach((source) =>
    addLightNode(terrain, source, brightnessByTile, queue, spreadBounds),
  );
  return spreadBlockLightFromQueue(terrain, queue, brightnessByTile, spreadBounds);
};

const combineBrightnessForBounds = (
  sunlightByTile: Record<string, number>,
  blockLightByTile: Record<string, number>,
  brightnessByTile: Record<string, number>,
  bounds: TileBounds,
) => {
  positionsInBounds(bounds).forEach((position) => {
    const key = tileKeyFor(position);
    brightnessByTile[key] = Math.max(
      sunlightByTile[key] ?? 0,
      blockLightByTile[key] ?? 0,
    );
  });
  return brightnessByTile;
};

const combinedBrightnessByTile = (
  terrain: TerrainTileMap,
  sunlight: Record<string, number>,
  blockLight: Record<string, number>,
) => {
  const brightnessByTile: Record<string, number> = {};
  return combineBrightnessForBounds(
    sunlight,
    blockLight,
    brightnessByTile,
    fullTileBounds(terrain.columnCount(), terrain.rowCount()),
  );
};

const lightingStateForTerrain = (terrain: TerrainTileMap): LightingState => {
  const lampKeys = lampKeysForTerrain(terrain);
  const sunlightByTile = sunlightBrightnessByTile(terrain);
  const blockLightByTile = blockLightBrightnessByTile(terrain, lampKeys);
  return {
    sunlightByTile,
    blockLightByTile,
    brightnessByTile: combinedBrightnessByTile(
      terrain,
      sunlightByTile,
      blockLightByTile,
    ),
    lampKeys,
  };
};

const applySunlightColumn = (
  terrain: TerrainTileMap,
  sunlightByTile: Record<string, number>,
  column: number,
) => {
  sunlightEntriesForColumn(terrain, column).forEach(([key, brightness]) => {
    sunlightByTile[key] = brightness;
  });
};

const positionFromKey = (key: string) => {
  const [column, row] = key.split(",").map(Number);
  return { column, row };
};

type TileLightingRasterOptions = {
  width: number;
  height: number;
  columns: number;
  rows: number;
  tileWidth: number;
  tileHeight: number;
  brightnessByTile: Record<string, number>;
};

type CanvasContext = {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  imageData: ImageData;
};

const isInsideLightMap = (
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

const createCanvasContext = (width: number, height: number): CanvasContext => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("TileLightingOverlay: canvas context unavailable");
  }
  return { canvas, context, imageData: context.createImageData(width, height) };
};

const tileAlphaAt = (
  brightnessByTile: Record<string, number>,
  columns: number,
  rows: number,
  column: number,
  row: number,
) => {
  if (!isInsideLightMap(column, row, columns, rows)) {
    return null;
  }
  return shadowAlphaFor(brightnessByTile[terrainTileKey(column, row)] ?? 0);
};

const cornerTilePositions = (column: number, row: number) => [
  { column: column - 1, row: row - 1 },
  { column, row: row - 1 },
  { column: column - 1, row },
  { column, row },
];

const cornerAlphaAt = (
  brightnessByTile: Record<string, number>,
  columns: number,
  rows: number,
  column: number,
  row: number,
) => {
  const alphas = cornerTilePositions(column, row)
    .map((position) =>
      tileAlphaAt(
        brightnessByTile,
        columns,
        rows,
        position.column,
        position.row,
      ),
    )
    .filter((alpha): alpha is number => alpha !== null);
  const totalAlpha = alphas.reduce((sum, alpha) => sum + alpha, 0);
  return totalAlpha / alphas.length;
};

const writeAlphaPixel = (
  imageData: ImageData,
  width: number,
  x: number,
  y: number,
  alpha: number,
) => {
  const index = (y * width + x) * 4;
  imageData.data[index] = 0;
  imageData.data[index + 1] = 0;
  imageData.data[index + 2] = 0;
  imageData.data[index + 3] = Math.round(alpha * 255);
};

const alphaCornerBoundsForTiles = (bounds: TileBounds) => ({
  left: bounds.left,
  right: bounds.right + 1,
  top: bounds.top,
  bottom: bounds.bottom + 1,
});

const putAlphaImageData = (alphaMap: CanvasContext, bounds: TileBounds) => {
  alphaMap.context.putImageData(
    alphaMap.imageData,
    0,
    0,
    bounds.left,
    bounds.top,
    bounds.right - bounds.left + 1,
    bounds.bottom - bounds.top + 1,
  );
};

const fillAlphaMapBounds = (
  alphaMap: CanvasContext,
  options: TileLightingRasterOptions,
  bounds: TileBounds,
) => {
  columnsInBounds(bounds).forEach((column) =>
    rowsInBounds(bounds).forEach((row) =>
      writeAlphaPixel(
        alphaMap.imageData,
        options.columns + 1,
        column,
        row,
        cornerAlphaAt(
          options.brightnessByTile,
          options.columns,
          options.rows,
          column,
          row,
        ),
      ),
    ),
  );
  putAlphaImageData(alphaMap, bounds);
};

const drawSmoothLightMap = (
  ctx: CanvasRenderingContext2D,
  alphaMap: CanvasContext,
  options: TileLightingRasterOptions,
) => {
  ctx.clearRect(0, 0, options.width, options.height);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(
    alphaMap.canvas,
    -options.tileWidth / 2,
    -options.tileHeight / 2,
    (options.columns + 1) * options.tileWidth,
    (options.rows + 1) * options.tileHeight,
  );
  ctx.restore();
};

class TileLightingRaster extends ex.Raster {
  private brightnessByTile: Record<string, number>;
  private readonly columns: number;
  private readonly rows: number;
  private readonly tileWidth: number;
  private readonly tileHeight: number;
  private readonly alphaMap: CanvasContext;

  constructor(options: TileLightingRasterOptions) {
    super({
      width: options.width,
      height: options.height,
      origin: ex.vec(0, 0),
      smoothing: true,
      filtering: ex.ImageFiltering.Pixel,
    });
    this.brightnessByTile = options.brightnessByTile;
    this.columns = options.columns;
    this.rows = options.rows;
    this.tileWidth = options.tileWidth;
    this.tileHeight = options.tileHeight;
    this.alphaMap = createCanvasContext(this.columns + 1, this.rows + 1);
    this.updateAlphaMap(fullTileBounds(this.columns, this.rows));
  }

  override clone() {
    return new TileLightingRaster(this.options());
  }

  public setBrightnessByTile(
    brightnessByTile: Record<string, number>,
    dirtyBounds: TileBounds = fullTileBounds(this.columns, this.rows),
  ) {
    this.brightnessByTile = brightnessByTile;
    this.updateAlphaMap(dirtyBounds);
    this.flagDirty();
  }

  override execute(ctx: CanvasRenderingContext2D) {
    drawSmoothLightMap(ctx, this.alphaMap, this.options());
  }

  private options(): TileLightingRasterOptions {
    return {
      width: this.width,
      height: this.height,
      columns: this.columns,
      rows: this.rows,
      tileWidth: this.tileWidth,
      tileHeight: this.tileHeight,
      brightnessByTile: this.brightnessByTile,
    };
  }

  private updateAlphaMap(dirtyBounds: TileBounds) {
    fillAlphaMapBounds(
      this.alphaMap,
      this.options(),
      alphaCornerBoundsForTiles(dirtyBounds),
    );
  }
}

export class TileLightingOverlay extends ex.Actor {
  private readonly terrain: TerrainTileMap;
  private readonly lightingRaster: TileLightingRaster;
  private lightingState: LightingState;

  constructor(terrain: TerrainTileMap) {
    const lightingState = lightingStateForTerrain(terrain);
    super({
      pos: terrain.origin(),
      anchor: ex.vec(0, 0),
      width: terrain.worldWidth(),
      height: terrain.worldHeight(),
      z: lightOverlayZ,
    });
    this.terrain = terrain;
    this.lightingState = lightingState;
    this.lightingRaster = new TileLightingRaster({
      width: terrain.worldWidth(),
      height: terrain.worldHeight(),
      columns: terrain.columnCount(),
      rows: terrain.rowCount(),
      tileWidth: terrain.tileWidthPx(),
      tileHeight: terrain.tileHeightPx(),
      brightnessByTile: lightingState.brightnessByTile,
    });
    this.graphics.anchor = ex.vec(0, 0);
    this.graphics.use(this.lightingRaster);
    this.terrain.onBlocksChanged((change) => this.rebuild(change));
  }

  public rebuild(change?: TerrainChange) {
    if (!change) {
      this.rebuildAll();
      return;
    }
    this.rebuildChangedTile(change);
  }

  private rebuildAll() {
    this.lightingState = lightingStateForTerrain(this.terrain);
    this.lightingRaster.setBrightnessByTile(this.lightingState.brightnessByTile);
  }

  private rebuildChangedTile(change: TerrainChange) {
    const sunlightBounds = columnBounds(change.column, this.terrain.rowCount());
    const blockLightBounds = boundsAround(
      change.column,
      change.row,
      lampLightLevel,
      this.terrain.columnCount(),
      this.terrain.rowCount(),
    );
    const dirtyBounds = unionBounds(sunlightBounds, blockLightBounds);
    this.updateLampSource(change);
    this.rebuildSunlightColumn(change.column);
    this.rebuildBlockLightBounds(blockLightBounds);
    combineBrightnessForBounds(
      this.lightingState.sunlightByTile,
      this.lightingState.blockLightByTile,
      this.lightingState.brightnessByTile,
      dirtyBounds,
    );
    this.lightingRaster.setBrightnessByTile(
      this.lightingState.brightnessByTile,
      dirtyBounds,
    );
  }

  private updateLampSource(change: TerrainChange) {
    const key = tileKeyFor(change);
    if (this.terrain.tileKindAt(change.column, change.row) === "lamp") {
      this.lightingState.lampKeys.add(key);
      return;
    }
    this.lightingState.lampKeys.delete(key);
  }

  private rebuildSunlightColumn(column: number) {
    applySunlightColumn(
      this.terrain,
      this.lightingState.sunlightByTile,
      column,
    );
  }

  private rebuildBlockLightBounds(bounds: TileBounds) {
    const spreadBounds = expandBounds(
      bounds,
      lampLightLevel,
      this.terrain.columnCount(),
      this.terrain.rowCount(),
    );
    const lampKeys = new Set(
      Array.from(this.lightingState.lampKeys).filter((key) =>
        isPositionInBounds(positionFromKey(key), spreadBounds),
      ),
    );
    const localBlockLight = blockLightBrightnessByTile(
      this.terrain,
      lampKeys,
      spreadBounds,
    );
    positionsInBounds(bounds).forEach((position) => {
      const key = tileKeyFor(position);
      const brightness = localBlockLight[key] ?? 0;
      if (brightness > 0) {
        this.lightingState.blockLightByTile[key] = brightness;
        return;
      }
      delete this.lightingState.blockLightByTile[key];
    });
  }
}
