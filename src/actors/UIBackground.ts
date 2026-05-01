import * as ex from "excalibur";

type UIBackgroundOptions = {
  pos?: ex.Vector;
  width: number;
  height: number;
  borderThickness?: number;
  innerBorderOffset?: number;
  innerBorderThickness?: number;
  fillOpacity?: number;
  z?: number;
};

const panelBorderColor = "#000000";
const panelFillColor = "#9a97b9";
const panelTopLeftLineColor = "#696682";
const panelBottomRightLineColor = "#c5c7dd";

class UIBackgroundRaster extends ex.Raster {
  private readonly borderThickness: number;
  private readonly innerBorderOffset: number;
  private readonly innerBorderThickness: number;
  private readonly fillOpacity: number;
  constructor(
    width: number,
    height: number,
    borderThickness: number,
    innerBorderOffset: number,
    innerBorderThickness: number,
    fillOpacity: number,
  ) {
    super({
      width,
      height,
      origin: ex.vec(0, 0),
      smoothing: false,
      filtering: ex.ImageFiltering.Pixel,
    });
    this.borderThickness = borderThickness;
    this.innerBorderOffset = innerBorderOffset;
    this.innerBorderThickness = innerBorderThickness;
    this.fillOpacity = fillOpacity;
  }

  override clone() {
    return new UIBackgroundRaster(
      this.width,
      this.height,
      this.borderThickness,
      this.innerBorderOffset,
      this.innerBorderThickness,
      this.fillOpacity,
    );
  }

  override execute(ctx: CanvasRenderingContext2D) {
    const fill =
      this.fillOpacity === 1
        ? panelFillColor
        : `rgba(248, 197, 58, ${this.fillOpacity})`;
    const w = this.width;
    const h = this.height;
    const t = Math.max(0, Math.floor(this.borderThickness));
    const innerH = Math.max(0, h - t * 2);
    const innerOffset = Math.max(0, Math.floor(this.innerBorderOffset));
    const innerT = Math.max(0, Math.floor(this.innerBorderThickness));
    const innerStripeW = Math.max(0, w - innerOffset * 2);
    const innerStripeH = Math.max(0, h - innerOffset * 2);

    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = panelBorderColor;
    ctx.fillRect(0, 0, w, t);
    ctx.fillRect(0, h - t, w, t);
    ctx.fillRect(0, t, t, innerH);
    ctx.fillRect(w - t, t, t, innerH);

    ctx.fillStyle = panelTopLeftLineColor;
    ctx.fillRect(innerOffset, innerOffset, innerStripeW, innerT);
    ctx.fillRect(innerOffset, innerOffset, innerT, innerStripeH);

    ctx.fillStyle = panelBottomRightLineColor;
    ctx.fillRect(innerOffset, h - innerOffset - innerT, innerStripeW, innerT);
    ctx.fillRect(w - innerOffset - innerT, innerOffset, innerT, innerStripeH);
  }
}

export class UIBackground extends ex.ScreenElement {
  constructor(options: UIBackgroundOptions) {
    const borderThickness = options.borderThickness ?? 2;
    const innerBorderOffset = options.innerBorderOffset ?? 2;
    const innerBorderThickness =
      options.innerBorderThickness ?? borderThickness;
    const fillOpacity = options.fillOpacity ?? 1;
    const z = options.z ?? 2000;
    super({
      pos: options.pos ?? ex.vec(0, 0),
      anchor: ex.vec(0, 0),
      width: options.width,
      height: options.height,
      z,
    });
    this.graphics.use(
      new UIBackgroundRaster(
        options.width,
        options.height,
        borderThickness,
        innerBorderOffset,
        innerBorderThickness,
        fillOpacity,
      ),
    );
  }
}
