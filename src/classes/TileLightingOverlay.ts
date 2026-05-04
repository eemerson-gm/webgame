import * as ex from "excalibur";
import type { TerrainTileKind } from "./GameProtocol";
import { TerrainTileMap } from "./TerrainTileMap";
import type { TerrainChange } from "./TerrainTileMap";
import type { DynamicLightSnapshot, DynamicLightSource } from "./DynamicLightSource";
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

type ViewBounds = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

type ViewLightingState = {
  cameraLeft: number;
  cameraTop: number;
  brightnessByTile: Record<string, number>;
  tileBounds: TileBounds;
  dynamicLights: ScreenLightSnapshot[];
};

type ScreenLightSnapshot = {
  x: number;
  y: number;
  radius: number;
  intensity: number;
};

type TileLightingRasterOptions = {
  width: number;
  height: number;
  tileWidth: number;
  tileHeight: number;
};

type CanvasContext = {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  imageData: ImageData;
};

const maxLightLevel = 15;
const maxShadowAlpha = 1;
const sunlightSolidDrop = 3;
const sunlightAirDrop = 1;
const lampLightLevel = 14;
const tileLightingZ = 900;
const indexes = (count: number) => Array.from({ length: count }, (_, index) => index);

const tileKeyFor = (position: { column: number; row: number }) =>
  terrainTileKey(position.column, position.row);

const lightLevelForKind = (kind: TerrainTileKind | null) =>
  kind === "lamp" ? lampLightLevel : 0;

const shadowAlphaFor = (brightness: number) =>
  maxShadowAlpha * (1 - Math.min(Math.max(brightness, 0), maxLightLevel) / maxLightLevel);

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
      state.entries.push([terrainTileKey(column, row), brightness]);
      return {
        isBlocked: state.isBlocked || isSolid,
        brightness,
        entries: state.entries,
      };
    },
    { isBlocked: false, brightness: maxLightLevel, entries: [] },
  ).entries;

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

const positionFromKey = (key: string) => {
  const [column, row] = key.split(",").map(Number);
  return { column, row };
};

const lightSourcesForLampKeys = (lampKeys: Set<string>) =>
  Array.from(lampKeys).map((key) => {
    const { column, row } = positionFromKey(key);
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
  spreadBounds: TileBounds,
) => {
  const brightnessByTile: Record<string, number> = {};
  const queue: TileLightNode[] = [];
  lightSourcesForLampKeys(lampKeys).forEach((source) =>
    addLightNode(terrain, source, brightnessByTile, queue, spreadBounds),
  );
  return spreadBlockLightFromQueue(terrain, queue, brightnessByTile, spreadBounds);
};

const sunlightBrightnessByTile = (terrain: TerrainTileMap, bounds: TileBounds) =>
  Object.fromEntries(
    columnsInBounds(bounds).flatMap((column) =>
      sunlightEntriesForColumn(terrain, column).filter((entry) => {
        const { row } = positionFromKey(entry[0]);
        if (row < bounds.top) {
          return false;
        }
        return row <= bounds.bottom;
      }),
    ),
  ) as Record<string, number>;

const viewBoundsFor = (camera: ex.Camera, width: number, height: number) => ({
  left: camera.pos.x - width / 2,
  right: camera.pos.x + width / 2,
  top: camera.pos.y - height / 2,
  bottom: camera.pos.y + height / 2,
});

const isDynamicLightInView = (
  snapshot: DynamicLightSnapshot,
  bounds: ViewBounds,
) => {
  if (snapshot.position.x + snapshot.radius < bounds.left) {
    return false;
  }
  if (snapshot.position.x - snapshot.radius > bounds.right) {
    return false;
  }
  if (snapshot.position.y + snapshot.radius < bounds.top) {
    return false;
  }
  return snapshot.position.y - snapshot.radius <= bounds.bottom;
};

const screenLightFor = (
  snapshot: DynamicLightSnapshot,
  bounds: ViewBounds,
): ScreenLightSnapshot => ({
  x: snapshot.position.x - bounds.left,
  y: snapshot.position.y - bounds.top,
  radius: snapshot.radius,
  intensity: snapshot.intensity,
});

const visibleTileBoundsFor = (
  terrain: TerrainTileMap,
  view: ViewBounds,
) => ({
  left: Math.max(Math.floor(view.left / terrain.tileWidthPx()) - 1, 0),
  right: Math.min(
    Math.floor(view.right / terrain.tileWidthPx()) + 1,
    terrain.columnCount() - 1,
  ),
  top: Math.max(Math.floor(view.top / terrain.tileHeightPx()) - 1, 0),
  bottom: Math.min(
    Math.floor(view.bottom / terrain.tileHeightPx()) + 1,
    terrain.rowCount() - 1,
  ),
});

const tileAlphaAt = (
  brightnessByTile: Record<string, number>,
  tileBounds: TileBounds,
  column: number,
  row: number,
) => {
  if (!isPositionInBounds({ column, row }, tileBounds)) {
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
  tileBounds: TileBounds,
  column: number,
  row: number,
) => {
  const alphas = cornerTilePositions(column, row)
    .map((position) =>
      tileAlphaAt(brightnessByTile, tileBounds, position.column, position.row),
    )
    .filter((alpha): alpha is number => alpha !== null);
  const totalAlpha = alphas.reduce((sum, alpha) => sum + alpha, 0);
  return totalAlpha / alphas.length;
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
  brightnessByTile: Record<string, number>,
  tileBounds: TileBounds,
) => {
  indexes(alphaMap.canvas.width).forEach((x) =>
    indexes(alphaMap.canvas.height).forEach((y) =>
      writeAlphaPixel(
        alphaMap.imageData,
        alphaMap.canvas.width,
        x,
        y,
        cornerAlphaAt(
          brightnessByTile,
          tileBounds,
          tileBounds.left + x,
          tileBounds.top + y,
        ),
      ),
    ),
  );
  alphaMap.context.putImageData(alphaMap.imageData, 0, 0);
};

const combinedBrightnessByTile = (
  terrain: TerrainTileMap,
  sunlightByTile: Record<string, number>,
  blockLightByTile: Record<string, number>,
  bounds: TileBounds,
) => {
  const brightnessByTile: Record<string, number> = {};
  positionsInBounds(bounds).forEach((position) => {
    const key = tileKeyFor(position);
    brightnessByTile[key] = Math.max(
      sunlightByTile[key] ?? 0,
      blockLightByTile[key] ?? 0,
    );
  });
  return brightnessByTile;
};

class TileLightingRaster extends ex.Raster {
  private readonly tileWidth: number;
  private readonly tileHeight: number;
  private viewState: ViewLightingState | null = null;

  constructor(options: TileLightingRasterOptions) {
    super({
      width: options.width,
      height: options.height,
      origin: ex.vec(0, 0),
      smoothing: true,
      filtering: ex.ImageFiltering.Pixel,
    });
    this.tileWidth = options.tileWidth;
    this.tileHeight = options.tileHeight;
  }

  override clone() {
    const raster = new TileLightingRaster({
      width: this.width,
      height: this.height,
      tileWidth: this.tileWidth,
      tileHeight: this.tileHeight,
    });
    if (this.viewState) {
      raster.setView(this.viewState);
    }
    return raster;
  }

  public setView(viewState: ViewLightingState) {
    this.viewState = viewState;
    this.flagDirty();
  }

  override execute(ctx: CanvasRenderingContext2D) {
    ctx.clearRect(0, 0, this.width, this.height);
    if (!this.viewState) {
      return;
    }
    this.drawView(ctx, this.viewState);
  }

  private drawView(ctx: CanvasRenderingContext2D, viewState: ViewLightingState) {
    const alphaWidth = viewState.tileBounds.right - viewState.tileBounds.left + 2;
    const alphaHeight = viewState.tileBounds.bottom - viewState.tileBounds.top + 2;
    const alphaMap = createCanvasContext(alphaWidth, alphaHeight);
    const worldX = viewState.tileBounds.left * this.tileWidth;
    const worldY = viewState.tileBounds.top * this.tileHeight;
    fillAlphaMap(alphaMap, viewState.brightnessByTile, viewState.tileBounds);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(
      alphaMap.canvas,
      worldX - viewState.cameraLeft - this.tileWidth / 2,
      worldY - viewState.cameraTop - this.tileHeight / 2,
      alphaWidth * this.tileWidth,
      alphaHeight * this.tileHeight,
    );
    this.cutDynamicLights(ctx, viewState.dynamicLights);
    ctx.restore();
  }

  private cutDynamicLights(ctx: CanvasRenderingContext2D, lights: ScreenLightSnapshot[]) {
    ctx.globalCompositeOperation = "destination-out";
    lights.forEach((light) => this.cutDynamicLight(ctx, light));
  }

  private cutDynamicLight(ctx: CanvasRenderingContext2D, light: ScreenLightSnapshot) {
    const gradient = ctx.createRadialGradient(
      light.x,
      light.y,
      0,
      light.x,
      light.y,
      light.radius,
    );
    gradient.addColorStop(0, `rgba(0, 0, 0, ${light.intensity})`);
    gradient.addColorStop(0.22, `rgba(0, 0, 0, ${light.intensity * 0.88})`);
    gradient.addColorStop(0.42, `rgba(0, 0, 0, ${light.intensity * 0.5})`);
    gradient.addColorStop(0.6, `rgba(0, 0, 0, ${light.intensity * 0.12})`);
    gradient.addColorStop(0.7, "rgba(0, 0, 0, 0)");
    gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(
      light.x - light.radius,
      light.y - light.radius,
      light.radius * 2,
      light.radius * 2,
    );
  }
}

export class TileLightingOverlay extends ex.ScreenElement {
  private readonly terrain: TerrainTileMap;
  private readonly lightingRaster: TileLightingRaster;
  private readonly dynamicLightSources: DynamicLightSource[] = [];
  private readonly lampKeys: Set<string>;
  private readonly viewWidth: number;
  private readonly viewHeight: number;

  constructor(terrain: TerrainTileMap, viewSize: ex.Vector) {
    super({
      pos: ex.vec(0, 0),
      anchor: ex.vec(0, 0),
      width: viewSize.x,
      height: viewSize.y,
      z: tileLightingZ,
    });
    this.terrain = terrain;
    this.viewWidth = viewSize.x;
    this.viewHeight = viewSize.y;
    this.lampKeys = lampKeysForTerrain(terrain);
    this.lightingRaster = new TileLightingRaster({
      width: viewSize.x,
      height: viewSize.y,
      tileWidth: terrain.tileWidthPx(),
      tileHeight: terrain.tileHeightPx(),
    });
    this.graphics.anchor = ex.vec(0, 0);
    this.graphics.use(this.lightingRaster);
    this.terrain.onBlocksChanged((change) => this.updateLampSource(change));
  }

  public addDynamicLight(source: DynamicLightSource) {
    if (this.dynamicLightSources.includes(source)) {
      return;
    }
    this.dynamicLightSources.push(source);
  }

  public removeDynamicLight(source: DynamicLightSource) {
    if (!this.dynamicLightSources.includes(source)) {
      return;
    }
    this.dynamicLightSources.splice(this.dynamicLightSources.indexOf(source), 1);
  }

  override onPostUpdate(engine: ex.Engine) {
    this.syncView(engine.currentScene.camera);
  }

  public rebuild(change?: TerrainChange) {
    if (!change) {
      this.lampKeys.clear();
      lampKeysForTerrain(this.terrain).forEach((key) => this.lampKeys.add(key));
      return;
    }
    this.updateLampSource(change);
  }

  private updateLampSource(change: TerrainChange) {
    const key = tileKeyFor(change);
    if (this.terrain.tileKindAt(change.column, change.row) === "lamp") {
      this.lampKeys.add(key);
      return;
    }
    this.lampKeys.delete(key);
  }

  private syncView(camera: ex.Camera) {
    const viewBounds = viewBoundsFor(camera, this.viewWidth, this.viewHeight);
    const tileBounds = visibleTileBoundsFor(this.terrain, viewBounds);
    const spreadBounds = expandBounds(
      tileBounds,
      lampLightLevel,
      this.terrain.columnCount(),
      this.terrain.rowCount(),
    );
    const visibleLampKeys = new Set(
      Array.from(this.lampKeys).filter((key) =>
        isPositionInBounds(positionFromKey(key), spreadBounds),
      ),
    );
    const sunlightByTile = sunlightBrightnessByTile(this.terrain, tileBounds);
    const blockLightByTile = blockLightBrightnessByTile(
      this.terrain,
      visibleLampKeys,
      spreadBounds,
    );
    this.lightingRaster.setView({
      cameraLeft: viewBounds.left,
      cameraTop: viewBounds.top,
      brightnessByTile: combinedBrightnessByTile(
        this.terrain,
        sunlightByTile,
        blockLightByTile,
        tileBounds,
      ),
      tileBounds,
      dynamicLights: this.visibleDynamicLights(viewBounds),
    });
  }

  private visibleDynamicLights(viewBounds: ViewBounds) {
    return this.dynamicLightSources
      .map((source) => source.snapshot())
      .filter((snapshot): snapshot is DynamicLightSnapshot => !!snapshot)
      .filter((snapshot) => isDynamicLightInView(snapshot, viewBounds))
      .map((snapshot) => screenLightFor(snapshot, viewBounds));
  }
}
