import * as ex from "excalibur";
import { Resources } from "../resource";

export const powerupItemDisplaySize = 8;

export class PowerupItemRaster extends ex.Raster {
  constructor() {
    super({
      width: powerupItemDisplaySize,
      height: powerupItemDisplaySize,
      origin: ex.vec(0, 0),
      smoothing: false,
      filtering: ex.ImageFiltering.Pixel,
    });
  }

  override clone() {
    return new PowerupItemRaster();
  }

  override execute(ctx: CanvasRenderingContext2D) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      Resources.MinerPowerupItem.image,
      0,
      0,
      Resources.MinerPowerupItem.width,
      Resources.MinerPowerupItem.height,
      0,
      0,
      powerupItemDisplaySize,
      powerupItemDisplaySize,
    );
  }
}
