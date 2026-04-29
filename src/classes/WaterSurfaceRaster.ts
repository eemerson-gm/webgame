import * as ex from "excalibur";
import type { WaterFlowDirection } from "./GameProtocol";
import type { WaterTileSnapshot } from "./WaterTileMap";
import { terrainTileKey } from "../world/terrainTiles";

type WaterSpan = {
  startColumn: number;
  endColumn: number;
  row: number;
  level: number;
};

type WaterSpanState = {
  spans: WaterSpan[];
  active: WaterSpan | null;
};

const waterColor = "rgba(35, 128, 255, 0.72)";
const waterDeepColor = "rgba(18, 83, 190, 0.42)";
const waterHighlightColor = "rgba(127, 202, 255, 0.48)";
const maxWaterLevel = 16;
const indexes = (count: number) => Array.from({ length: count }, (_, index) => index);

const waterLevelAt = (snapshot: WaterTileSnapshot, column: number, row: number) =>
  snapshot.waterTiles[terrainTileKey(column, row)] ?? 0;

const waterDirectionAt = (
  snapshot: WaterTileSnapshot,
  column: number,
  row: number,
): WaterFlowDirection =>
  snapshot.flowDirections[terrainTileKey(column, row)] ?? "still";

const isFallingWater = (
  snapshot: WaterTileSnapshot,
  column: number,
  row: number,
) => waterLevelAt(snapshot, column, row) > 0 && waterDirectionAt(snapshot, column, row) === "down";

const isPooledWater = (
  snapshot: WaterTileSnapshot,
  column: number,
  row: number,
) => waterLevelAt(snapshot, column, row) > 0 && !isFallingWater(snapshot, column, row);

const spanStateWithClosedActive = (state: WaterSpanState) => ({
  spans: state.active ? [...state.spans, state.active] : state.spans,
  active: null,
});

const nextSpanState = (
  state: WaterSpanState,
  column: number,
  row: number,
  level: number,
) => {
  if (level <= 0) {
    return spanStateWithClosedActive(state);
  }
  if (!state.active) {
    return {
      spans: state.spans,
      active: { startColumn: column, endColumn: column, row, level },
    };
  }
  return {
    spans: state.spans,
    active: {
      ...state.active,
      endColumn: column,
      level: Math.max(state.active.level, level),
    },
  };
};

const spansForRow = (
  snapshot: WaterTileSnapshot,
  row: number,
  levelForColumn: (column: number) => number,
) =>
  spanStateWithClosedActive(
    indexes(snapshot.columns).reduce<WaterSpanState>(
      (state, column) => nextSpanState(state, column, row, levelForColumn(column)),
      { spans: [], active: null },
    ),
  ).spans;

const poolSpansForSnapshot = (snapshot: WaterTileSnapshot) =>
  indexes(snapshot.rows).flatMap((row) =>
    spansForRow(snapshot, row, (column) =>
      isPooledWater(snapshot, column, row)
        ? waterLevelAt(snapshot, column, row)
        : 0,
    ),
  );

const fallingSpansForSnapshot = (snapshot: WaterTileSnapshot) =>
  indexes(snapshot.rows).flatMap((row) =>
    spansForRow(snapshot, row, (column) =>
      isFallingWater(snapshot, column, row) ? maxWaterLevel : 0,
    ),
  );

const spanX = (span: WaterSpan, snapshot: WaterTileSnapshot) =>
  span.startColumn * snapshot.tileWidth;

const spanWidth = (span: WaterSpan, snapshot: WaterTileSnapshot) =>
  (span.endColumn - span.startColumn + 1) * snapshot.tileWidth;

const spanTopY = (span: WaterSpan, snapshot: WaterTileSnapshot) =>
  span.row * snapshot.tileHeight +
  Math.max(0, snapshot.tileHeight - Math.min(snapshot.tileHeight, span.level));

const spanBottomY = (span: WaterSpan, snapshot: WaterTileSnapshot) =>
  (span.row + 1) * snapshot.tileHeight;

export class WaterSurfaceRaster extends ex.Raster {
  private snapshot: WaterTileSnapshot;

  constructor(snapshot: WaterTileSnapshot) {
    super({
      width: snapshot.columns * snapshot.tileWidth,
      height: snapshot.rows * snapshot.tileHeight,
      origin: ex.vec(0, 0),
      smoothing: false,
      filtering: ex.ImageFiltering.Pixel,
    });
    this.snapshot = snapshot;
  }

  override clone() {
    return new WaterSurfaceRaster(this.snapshot);
  }

  public setSnapshot(snapshot: WaterTileSnapshot) {
    this.snapshot = snapshot;
    this.flagDirty();
  }

  override execute(ctx: CanvasRenderingContext2D) {
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.fillStyle = waterColor;
    fallingSpansForSnapshot(this.snapshot).forEach((span) =>
      ctx.fillRect(
        spanX(span, this.snapshot),
        span.row * this.snapshot.tileHeight,
        spanWidth(span, this.snapshot),
        this.snapshot.tileHeight,
      ),
    );
    poolSpansForSnapshot(this.snapshot).forEach((span) => {
      const x = spanX(span, this.snapshot);
      const y = spanTopY(span, this.snapshot);
      const width = spanWidth(span, this.snapshot);
      const height = spanBottomY(span, this.snapshot) - y;
      ctx.fillStyle = waterColor;
      ctx.fillRect(x, y, width, height);
      ctx.fillStyle = waterDeepColor;
      ctx.fillRect(x, y + Math.max(1, Math.floor(height / 2)), width, Math.ceil(height / 2));
      ctx.fillStyle = waterHighlightColor;
      ctx.fillRect(x, y, width, 1);
    });
  }
}
