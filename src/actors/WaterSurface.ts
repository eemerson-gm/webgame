import * as ex from "excalibur";
import { WaterTileMap } from "../classes/WaterTileMap";
import { WaterSurfaceRaster } from "../classes/WaterSurfaceRaster";

const waterSurfaceZ = 1;

export class WaterSurface extends ex.Actor {
  private readonly water: WaterTileMap;
  private readonly raster: WaterSurfaceRaster;
  private renderedRevision: number;

  constructor(water: WaterTileMap) {
    const snapshot = water.snapshot();
    super({
      pos: water.pos,
      anchor: ex.vec(0, 0),
      width: snapshot.columns * snapshot.tileWidth,
      height: snapshot.rows * snapshot.tileHeight,
      z: waterSurfaceZ,
    });
    this.water = water;
    this.raster = new WaterSurfaceRaster(snapshot);
    this.renderedRevision = water.revision();
    this.graphics.anchor = ex.vec(0, 0);
    this.graphics.use(this.raster);
  }

  override onPostUpdate() {
    if (this.renderedRevision === this.water.revision()) {
      return;
    }
    this.renderedRevision = this.water.revision();
    this.raster.setSnapshot(this.water.snapshot());
  }
}
