import * as ex from "excalibur";
import type { TerrainTileKind } from "./GameProtocol";
import { TerrainTileMap } from "./TerrainTileMap";
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

const maxLightLevel = 15;
const maxShadowAlpha = 0.78;
const sunlightSolidDrop = 3;
const sunlightAirDrop = 1;
const lampLightLevel = 14;
const indexes = (count: number) => Array.from({ length: count }, (_, index) => index);
const lightOverlayZ = 1;

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

const sunlightEntriesForColumn = (terrain: TerrainTileMap, column: number) =>
  indexes(terrain.rowCount()).reduce<SunlightState>(
    (state, row) => {
      const isSolid = terrain.isSolidAt(column, row);
      const isOpenSky = !state.isBlocked && !isSolid;
      const fadeAmount = isSolid ? sunlightSolidDrop : sunlightAirDrop;
      const brightness = isOpenSky
        ? maxLightLevel
        : Math.max(state.brightness - fadeAmount, 0);
      return {
        isBlocked: state.isBlocked || isSolid,
        brightness,
        entries: [...state.entries, [terrainTileKey(column, row), brightness]],
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
) => {
  const key = terrainTileKey(node.column, node.row);
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
) => {
  const cursor = { index: 0 };
  while (cursor.index < queue.length) {
    const source = queue[cursor.index];
    cursor.index += 1;
    adjacentPositions(source.column, source.row)
      .filter(({ column, row }) => terrain.isInside(column, row))
      .map((target) => neighborLightNode(terrain, source, target))
      .filter(({ brightness }) => brightness > 0)
      .forEach((node) => addLightNode(terrain, node, brightnessByTile, queue));
  }
  return brightnessByTile;
};

const blockLightBrightnessByTile = (terrain: TerrainTileMap) => {
  const sources = lightSourcesForTerrain(terrain);
  const brightnessByTile: Record<string, number> = {};
  const queue: TileLightNode[] = [];
  sources.forEach((source) =>
    addLightNode(terrain, source, brightnessByTile, queue),
  );
  return spreadBlockLightFromQueue(terrain, queue, brightnessByTile);
};

const combinedBrightnessByTile = (terrain: TerrainTileMap) => {
  const sunlight = sunlightBrightnessByTile(terrain);
  const blockLight = blockLightBrightnessByTile(terrain);
  return Object.fromEntries(
    indexes(terrain.columnCount()).flatMap((column) =>
      indexes(terrain.rowCount()).map((row) => {
        const key = terrainTileKey(column, row);
        return [key, Math.max(sunlight[key] ?? 0, blockLight[key] ?? 0)];
      }),
    ),
  ) as Record<string, number>;
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
  return { canvas, context };
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

const fillAlphaMap = (
  alphaMap: CanvasContext,
  options: TileLightingRasterOptions,
) => {
  const width = options.columns + 1;
  const height = options.rows + 1;
  const imageData = alphaMap.context.createImageData(width, height);
  indexes(width).forEach((column) =>
    indexes(height).forEach((row) =>
      writeAlphaPixel(
        imageData,
        width,
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
  alphaMap.context.putImageData(imageData, 0, 0);
};

const drawSmoothLightMap = (
  ctx: CanvasRenderingContext2D,
  alphaMap: CanvasContext,
  options: TileLightingRasterOptions,
) => {
  fillAlphaMap(alphaMap, options);
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
  }

  override clone() {
    return new TileLightingRaster(this.options());
  }

  public setBrightnessByTile(brightnessByTile: Record<string, number>) {
    this.brightnessByTile = brightnessByTile;
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
}

export class TileLightingOverlay extends ex.Actor {
  private readonly terrain: TerrainTileMap;
  private readonly lightingRaster: TileLightingRaster;

  constructor(terrain: TerrainTileMap) {
    super({
      pos: terrain.origin(),
      anchor: ex.vec(0, 0),
      width: terrain.worldWidth(),
      height: terrain.worldHeight(),
      z: lightOverlayZ,
    });
    this.terrain = terrain;
    this.lightingRaster = new TileLightingRaster({
      width: terrain.worldWidth(),
      height: terrain.worldHeight(),
      columns: terrain.columnCount(),
      rows: terrain.rowCount(),
      tileWidth: terrain.tileWidthPx(),
      tileHeight: terrain.tileHeightPx(),
      brightnessByTile: combinedBrightnessByTile(terrain),
    });
    this.graphics.anchor = ex.vec(0, 0);
    this.graphics.use(this.lightingRaster);
    this.terrain.onBlocksChanged(() => this.rebuild());
  }

  public rebuild() {
    this.lightingRaster.setBrightnessByTile(combinedBrightnessByTile(this.terrain));
  }
}
