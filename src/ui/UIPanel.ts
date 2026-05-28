import * as ex from "excalibur";
import { fillPixelRect, preparePixelCanvas } from "./pixelUi";

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

export const uiPanelInnerContentInset = innerBorderOffset + innerBorderThickness;

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
    preparePixelCanvas(ctx);
    const w = this.width;
    const h = this.height;
    const outerT = outerBorderThickness;
    const outerInnerW = Math.max(0, w - outerT * 2);
    const outerInnerH = Math.max(0, h - outerT * 2);
    const innerOffset = innerBorderOffset;
    const innerT = innerBorderThickness;
    const innerStripeW = Math.max(0, w - innerOffset * 2);
    const innerSideStripeH = Math.max(0, h - innerOffset * 2 - innerT * 2);

    ctx.fillStyle = `rgba(0, 0, 0, ${this.fillOpacity})`;
    fillPixelRect(ctx, outerT, outerT, outerInnerW, outerInnerH);

    ctx.fillStyle = panelBorderColor;
    fillPixelRect(ctx, 0, 0, w, outerT);
    fillPixelRect(ctx, 0, h - outerT, w, outerT);
    fillPixelRect(ctx, 0, outerT, outerT, h - outerT * 2);
    fillPixelRect(ctx, w - outerT, outerT, outerT, h - outerT * 2);

    fillPixelRect(ctx, innerOffset, innerOffset, innerStripeW, innerT);
    fillPixelRect(ctx, innerOffset, h - innerOffset - innerT, innerStripeW, innerT);
    fillPixelRect(ctx, innerOffset, innerOffset + innerT, innerT, innerSideStripeH);
    fillPixelRect(
      ctx,
      w - innerOffset - innerT,
      innerOffset + innerT,
      innerT,
      innerSideStripeH,
    );
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
