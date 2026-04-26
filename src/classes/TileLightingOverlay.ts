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

class TileLightingRaster extends ex.Raster {
  private brightnessByTile: Record<string, number>;
  private readonly columns: number;
  private readonly rows: number;
  private readonly tileWidth: number;
  private readonly tileHeight: number;

  constructor(terrain: TerrainTileMap, brightnessByTile: Record<string, number>) {
    super({
      width: terrain.worldWidth(),
      height: terrain.worldHeight(),
      origin: ex.vec(0, 0),
      smoothing: true,
      filtering: ex.ImageFiltering.Pixel,
    });
    this.brightnessByTile = brightnessByTile;
    this.columns = terrain.columnCount();
    this.rows = terrain.rowCount();
    this.tileWidth = terrain.tileWidthPx();
    this.tileHeight = terrain.tileHeightPx();
  }

  override clone() {
    return new TileLightingRasterLike(
      this.width,
      this.height,
      this.columns,
      this.rows,
      this.tileWidth,
      this.tileHeight,
      this.brightnessByTile,
    );
  }

  public setBrightnessByTile(brightnessByTile: Record<string, number>) {
    this.brightnessByTile = brightnessByTile;
    this.flagDirty();
  }

  override execute(ctx: CanvasRenderingContext2D) {
    ctx.clearRect(0, 0, this.width, this.height);
    indexes(this.columns).forEach((column) =>
      indexes(this.rows).forEach((row) => this.drawShadowTile(ctx, column, row)),
    );
  }

  private drawShadowTile(
    ctx: CanvasRenderingContext2D,
    column: number,
    row: number,
  ) {
    const x = column * this.tileWidth;
    const y = row * this.tileHeight;
    const alpha = shadowAlphaFor(
      this.brightnessByTile[terrainTileKey(column, row)] ?? 0,
    );
    if (alpha <= 0) {
      return;
    }
    ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
    ctx.fillRect(x, y, this.tileWidth, this.tileHeight);
  }
}

class TileLightingRasterLike extends ex.Raster {
  private readonly brightnessByTile: Record<string, number>;
  private readonly columns: number;
  private readonly rows: number;
  private readonly tileWidth: number;
  private readonly tileHeight: number;

  constructor(
    width: number,
    height: number,
    columns: number,
    rows: number,
    tileWidth: number,
    tileHeight: number,
    brightnessByTile: Record<string, number>,
  ) {
    super({
      width,
      height,
      origin: ex.vec(0, 0),
      smoothing: true,
      filtering: ex.ImageFiltering.Pixel,
    });
    this.brightnessByTile = brightnessByTile;
    this.columns = columns;
    this.rows = rows;
    this.tileWidth = tileWidth;
    this.tileHeight = tileHeight;
  }

  override clone() {
    return new TileLightingRasterLike(
      this.width,
      this.height,
      this.columns,
      this.rows,
      this.tileWidth,
      this.tileHeight,
      this.brightnessByTile,
    );
  }

  override execute(ctx: CanvasRenderingContext2D) {
    ctx.clearRect(0, 0, this.width, this.height);
    indexes(this.columns).forEach((column) =>
      indexes(this.rows).forEach((row) => {
        const x = column * this.tileWidth;
        const y = row * this.tileHeight;
        const alpha = shadowAlphaFor(
          this.brightnessByTile[terrainTileKey(column, row)] ?? 0,
        );
        if (alpha <= 0) {
          return;
        }
        ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
        ctx.fillRect(x, y, this.tileWidth, this.tileHeight);
      }),
    );
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
    this.lightingRaster = new TileLightingRaster(
      terrain,
      combinedBrightnessByTile(terrain),
    );
    this.graphics.anchor = ex.vec(0, 0);
    this.graphics.use(this.lightingRaster);
    this.terrain.onBlocksChanged(() => this.rebuild());
  }

  public rebuild() {
    this.lightingRaster.setBrightnessByTile(combinedBrightnessByTile(this.terrain));
  }
}
