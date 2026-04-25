import * as ex from "excalibur";
import { TILE_PX } from "../world/worldConfig";

const blockHighlightOutlineThickness = 1;

export class BlockHighlightRaster extends ex.Raster {
  private outlineColor: string;

  constructor(color: string) {
    super({
      width: TILE_PX,
      height: TILE_PX,
      origin: ex.vec(0, 0),
      smoothing: false,
      filtering: ex.ImageFiltering.Pixel,
    });
    this.outlineColor = color;
  }

  override clone() {
    return new BlockHighlightRaster(this.outlineColor);
  }

  public setColor(color: string) {
    if (color === this.outlineColor) {
      return;
    }
    this.outlineColor = color;
    this.flagDirty();
  }

  override execute(ctx: CanvasRenderingContext2D) {
    ctx.strokeStyle = this.outlineColor;
    ctx.lineWidth = blockHighlightOutlineThickness;
    ctx.strokeRect(
      blockHighlightOutlineThickness / 2,
      blockHighlightOutlineThickness / 2,
      TILE_PX - blockHighlightOutlineThickness,
      TILE_PX - blockHighlightOutlineThickness,
    );
  }
}
