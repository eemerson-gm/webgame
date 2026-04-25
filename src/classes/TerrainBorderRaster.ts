import * as ex from "excalibur";

export type TerrainBorderSegment = {
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
};

export class TerrainBorderRaster extends ex.Raster {
  private segments: TerrainBorderSegment[];

  constructor(width: number, height: number, segments: TerrainBorderSegment[]) {
    super({
      width,
      height,
      origin: ex.vec(0, 0),
      smoothing: false,
      filtering: ex.ImageFiltering.Pixel,
    });
    this.segments = segments;
  }

  override clone() {
    return new TerrainBorderRaster(this.width, this.height, this.segments);
  }

  override execute(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = "black";
    this.segments.forEach((segment) =>
      ctx.fillRect(segment.offsetX, segment.offsetY, segment.width, segment.height),
    );
  }
}
