import * as ex from "excalibur";
import { TILE_PX } from "../world/worldConfig";

export class DamageFlashRaster extends ex.Raster {
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
    return new DamageFlashRaster();
  }

  override execute(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, TILE_PX, TILE_PX);
  }
}
