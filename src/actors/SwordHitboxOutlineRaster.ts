import * as ex from "excalibur";
import { TILE_PX } from "../world/worldConfig";

const swordHitboxOutlineThickness = 1;
const swordHitboxOutlineColor = "#ff3b30";

export class SwordHitboxOutlineRaster extends ex.Raster {
  constructor() {
    super({
      width: TILE_PX,
      height: TILE_PX,
      origin: ex.vec(0, 0),
      smoothing: false,
      filtering: ex.ImageFiltering.Pixel,
    });
  }

  override clone() {
    return new SwordHitboxOutlineRaster();
  }

  override execute(ctx: CanvasRenderingContext2D) {
    ctx.strokeStyle = swordHitboxOutlineColor;
    ctx.lineWidth = swordHitboxOutlineThickness;
    ctx.strokeRect(
      swordHitboxOutlineThickness / 2,
      swordHitboxOutlineThickness / 2,
      TILE_PX - swordHitboxOutlineThickness,
      TILE_PX - swordHitboxOutlineThickness,
    );
  }
}
