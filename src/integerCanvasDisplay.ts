import type * as ex from "excalibur";

type IntegerCanvasDisplayOptions = {
  viewWidth: number;
  viewHeight: number;
  pixelRatio: number;
  maxDisplayWidth?: number;
};

const frameForCanvas = (engine: ex.Engine): HTMLElement | null => {
  const canvasParent = engine.canvas.parentElement;
  if (canvasParent === null) {
    return null;
  }
  return canvasParent;
};

const pageForFrame = (frame: HTMLElement): HTMLElement | null => frame.parentElement;

export const wireIntegerCanvasDisplay = (
  engine: ex.Engine,
  options: IntegerCanvasDisplayOptions,
) => {
  const applyDisplayScale = () => {
    const frame = frameForCanvas(engine);
    const page = frame === null ? null : pageForFrame(frame);
    if (frame === null || page === null) {
      return;
    }
    const bufferWidth = options.viewWidth * options.pixelRatio;
    const bufferHeight = options.viewHeight * options.pixelRatio;
    const maxDisplayWidth = options.maxDisplayWidth ?? page.clientWidth;
    const layoutWidth = Math.min(maxDisplayWidth, page.clientWidth);
    const layoutHeight = layoutWidth * (options.viewHeight / options.viewWidth);
    const scale = Math.max(
      1,
      Math.min(
        Math.floor(layoutWidth / bufferWidth),
        Math.floor(layoutHeight / bufferHeight),
      ),
    );
    const displayWidth = bufferWidth * scale;
    const displayHeight = bufferHeight * scale;
    frame.style.width = `${displayWidth}px`;
    frame.style.height = `${displayHeight}px`;
    engine.canvas.style.width = `${displayWidth}px`;
    engine.canvas.style.height = `${displayHeight}px`;
  };

  applyDisplayScale();
  const frame = frameForCanvas(engine);
  const page = frame === null ? null : pageForFrame(frame);
  if (page === null) {
    return;
  }
  const observer = new ResizeObserver(applyDisplayScale);
  observer.observe(page);
};
