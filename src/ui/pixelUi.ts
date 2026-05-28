export const snapPixel = (value: number): number => Math.round(value);

export const preparePixelCanvas = (ctx: CanvasRenderingContext2D): void => {
  ctx.imageSmoothingEnabled = false;
};

export const fillPixelRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
): void => {
  ctx.fillRect(snapPixel(x), snapPixel(y), snapPixel(width), snapPixel(height));
};
