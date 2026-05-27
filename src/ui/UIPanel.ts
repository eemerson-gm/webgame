import * as ex from "excalibur";

type UIPanelOptions = {
  pos?: ex.Vector;
  width: number;
  height: number;
  fillOpacity?: number;
  z?: number;
};

const panelBorderColor = "#000000";
const outerBorderThickness = 1;
const innerBorderOffset = 2;
const innerBorderThickness = 1;

class UIPanelRaster extends ex.Raster {
  private readonly fillOpacity: number;
  constructor(width: number, height: number, fillOpacity: number) {
    super({
      width,
      height,
      origin: ex.vec(0, 0),
      smoothing: false,
      filtering: ex.ImageFiltering.Pixel,
    });
    this.fillOpacity = fillOpacity;
  }

  override clone() {
    return new UIPanelRaster(this.width, this.height, this.fillOpacity);
  }

  override execute(ctx: CanvasRenderingContext2D) {
    const w = this.width;
    const h = this.height;
    const outerT = outerBorderThickness;
    const outerInnerW = Math.max(0, w - outerT * 2);
    const outerInnerH = Math.max(0, h - outerT * 2);
    const innerOffset = innerBorderOffset;
    const innerT = innerBorderThickness;
    const innerStripeW = Math.max(0, w - innerOffset * 2);
    const innerStripeH = Math.max(0, h - innerOffset * 2);

    ctx.fillStyle = `rgba(0, 0, 0, ${this.fillOpacity})`;
    ctx.fillRect(outerT, outerT, outerInnerW, outerInnerH);

    ctx.fillStyle = panelBorderColor;
    ctx.fillRect(0, 0, w, outerT);
    ctx.fillRect(0, h - outerT, w, outerT);
    ctx.fillRect(0, outerT, outerT, outerInnerH);
    ctx.fillRect(w - outerT, outerT, outerT, outerInnerH);

    ctx.fillRect(innerOffset, innerOffset, innerStripeW, innerT);
    ctx.fillRect(innerOffset, innerOffset, innerT, innerStripeH);
    ctx.fillRect(innerOffset, h - innerOffset - innerT, innerStripeW, innerT);
    ctx.fillRect(w - innerOffset - innerT, innerOffset, innerT, innerStripeH);
  }
}

export class UIPanel extends ex.ScreenElement {
  constructor(options: UIPanelOptions) {
    const fillOpacity = options.fillOpacity ?? 0.5;
    const z = options.z ?? 2000;
    super({
      pos: options.pos ?? ex.vec(0, 0),
      anchor: ex.vec(0, 0),
      width: options.width,
      height: options.height,
      z,
    });
    this.graphics.use(
      new UIPanelRaster(options.width, options.height, fillOpacity),
    );
  }
}
