import {
  overlayCenterForFrame,
  spritePixelPointForEditorPoint,
} from "./coordinates.js";
import { currentFrame, spriteMetaForKey } from "./state.js";

const overlaySizePx = 128;

const brushSize = (ui) => Math.max(1, Math.round(Number(ui.brushSize.value ?? 3)));

const hexToColor = (hex) => {
  const value = String(hex ?? "#ff0000").replace("#", "");
  const n = Number.parseInt(value, 16);
  return {
    r: (n >> 16) & 255,
    g: (n >> 8) & 255,
    b: n & 255,
    a: 255,
  };
};

const colorToHex = (r, g, b) =>
  `#${[r, g, b]
    .map((part) => part.toString(16).padStart(2, "0"))
    .join("")}`;

export const createDrawingActions = ({ state, ui, render, syncPoseEditorToSelection }) => {
  const metaForKey = (spriteKey) => spriteMetaForKey(state, spriteKey);
  const isDrawMode = () => state.editorMode === "draw" || state.editorMode === "erase";
  const isEyedropperMode = () => state.editorMode === "eyedropper";

  const setToolButtonStates = () => {
    ui.modeSelect.classList.toggle("is-active", state.editorMode === "select");
    ui.modeDraw.classList.toggle("is-active", state.editorMode === "draw");
    ui.modeErase.classList.toggle("is-active", state.editorMode === "erase");
    ui.modeEyedropper.classList.toggle(
      "is-active",
      state.editorMode === "eyedropper",
    );
    ui.modeSelect.disabled = state.editorMode === "select";
    ui.modeDraw.disabled = state.editorMode === "draw";
    ui.modeErase.disabled = state.editorMode === "erase";
    ui.modeEyedropper.disabled = state.editorMode === "eyedropper";
  };

  const setMode = (mode) => {
    state.editorMode = mode;
    setToolButtonStates();
    if (mode === "select") {
      syncPoseEditorToSelection();
      state.pixelPreview.active = false;
      render();
      return;
    }
    ui.poseEditor.hidden = true;
    ui.poseNone.hidden = false;
    render();
  };

  const setModeSelect = () => setMode("select");
  const setModeDraw = () => setMode("draw");
  const setModeErase = () => setMode("erase");
  const setModeEyedropper = () => setMode("eyedropper");

  const clearPixelPreview = () => {
    state.pixelPreview.active = false;
    state.pixelPreview.frameIndex = null;
  };

  const resetPixelDraw = () => {
    state.pixelDraw.active = false;
    state.pixelDraw.poseId = null;
    state.pixelDraw.frameIndex = null;
    state.pixelDraw.canvas = null;
    state.pixelDraw.ctx = null;
    state.pixelDraw.brushDirty = false;
    state.pixelDraw.beforeToken = "";
    clearPixelPreview();
  };

  const ensurePixelCanvasForPose = async () => {
    const frameIndex = state.currentFrameIndex;
    const pixelDraw = state.pixelDraw;
    const canvasAlreadyReady =
      pixelDraw.active === true &&
      pixelDraw.frameIndex === frameIndex &&
      pixelDraw.canvas !== null &&
      pixelDraw.ctx !== null;
    if (canvasAlreadyReady) {
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = overlaySizePx;
    canvas.height = overlaySizePx;
    const ctx = canvas.getContext("2d");
    if (ctx === null) {
      return;
    }
    ctx.imageSmoothingEnabled = false;

    const frame = currentFrame(state);
    if (frame === null) {
      return;
    }

    const overlayDataUrl = frame.overlayPixelDataUrl;
    if (overlayDataUrl !== undefined) {
      const cached = state.pixelCanvasByDataUrl[overlayDataUrl];
      if (cached !== undefined && cached !== null) {
        ctx.drawImage(cached, 0, 0, overlaySizePx, overlaySizePx);
      }
      const needsDecodeFromDataUrl =
        cached === undefined || cached === null;
      if (needsDecodeFromDataUrl === true) {
        const img = new Image();
        img.src = overlayDataUrl;
        await new Promise((resolve) => {
          img.onload = () => resolve();
          img.onerror = () => resolve();
        });
        ctx.drawImage(img, 0, 0, overlaySizePx, overlaySizePx);
      }
    }

    pixelDraw.active = true;
    pixelDraw.poseId = null;
    pixelDraw.frameIndex = frameIndex;
    pixelDraw.canvas = canvas;
    pixelDraw.ctx = ctx;
    pixelDraw.brushDirty = false;
    pixelDraw.beforeToken = frame.overlayPixelDataUrl ?? "";
  };

  const pixelIndexesForBrush = (pixelPoint) => {
    const size = brushSize(ui);
    const half = Math.floor(size / 2);
    const startX = Math.round(pixelPoint.u) - half;
    const startY = Math.round(pixelPoint.v) - half;
    return Array.from({ length: size }).flatMap((_, yIndex) =>
      Array.from({ length: size }).map((__, xIndex) => ({
        x: startX + xIndex,
        y: startY + yIndex,
      })),
    );
  };

  const pixelMatchesColor = (data, offset, color) =>
    data[offset] === color.r &&
    data[offset + 1] === color.g &&
    data[offset + 2] === color.b &&
    data[offset + 3] === color.a;

  const setPixel = (imageData, x, y, color) => {
    if (x < 0 || y < 0 || x >= overlaySizePx || y >= overlaySizePx) {
      return false;
    }
    const offset = (y * overlaySizePx + x) * 4;
    if (pixelMatchesColor(imageData.data, offset, color)) {
      return false;
    }
    imageData.data[offset] = color.r;
    imageData.data[offset + 1] = color.g;
    imageData.data[offset + 2] = color.b;
    imageData.data[offset + 3] = color.a;
    return true;
  };

  const stampBrushOnPixelCanvas = (pixelCtx, pixelPoint) => {
    const color = state.editorMode === "erase"
      ? { r: 0, g: 0, b: 0, a: 0 }
      : hexToColor(ui.brushColor.value);
    const imageData = pixelCtx.getImageData(0, 0, overlaySizePx, overlaySizePx);
    const changed = pixelIndexesForBrush(pixelPoint)
      .map((point) => setPixel(imageData, point.x, point.y, color))
      .some((value) => value === true);
    if (changed) {
      pixelCtx.putImageData(imageData, 0, 0);
    }
    return changed;
  };

  const commitPixelDraw = () => {
    const pixelDraw = state.pixelDraw;
    if (pixelDraw.active !== true) {
      return;
    }
    const frame = currentFrame(state);
    if (frame === null) {
      resetPixelDraw();
      return;
    }
    if (pixelDraw.canvas === null) {
      resetPixelDraw();
      return;
    }
    if (pixelDraw.brushDirty !== true) {
      resetPixelDraw();
      render();
      syncPoseEditorToSelection();
      return;
    }

    const dataUrl = pixelDraw.canvas.toDataURL("image/png");
    const frameIndex = state.currentFrameIndex;
    const stack = state.overlayUndoStackByFrameIndex[frameIndex] ?? [];
    state.overlayUndoStackByFrameIndex[frameIndex] = stack;
    stack.push(pixelDraw.beforeToken ?? "");
    frame.overlayPixelDataUrl = dataUrl;
    frame.overlayVisible = frame.overlayVisible === undefined ? true : frame.overlayVisible;
    state.pixelCanvasByDataUrl[dataUrl] = pixelDraw.canvas;
    resetPixelDraw();
    render();
    syncPoseEditorToSelection();
  };

  const undoOverlayDraw = () => {
    if (state.pixelDraw.active === true) {
      commitPixelDraw();
    }
    const frame = currentFrame(state);
    if (frame === null) {
      ui.status.textContent = "Undo: no frame";
      return false;
    }
    const frameIndex = state.currentFrameIndex;
    const stack = state.overlayUndoStackByFrameIndex[frameIndex];
    if (stack === undefined) {
      ui.status.textContent = "Undo: no stack for frame";
      return false;
    }
    if (stack.length <= 0) {
      ui.status.textContent = "Undo: stack empty";
      return false;
    }
    const token = stack.pop() ?? "";
    const nextOverlay = token === "" ? undefined : token;
    frame.overlayPixelDataUrl = nextOverlay;
    if (nextOverlay === undefined) {
      frame.overlayVisible = undefined;
    }
    if (nextOverlay !== undefined) {
      frame.overlayVisible = frame.overlayVisible === undefined ? true : frame.overlayVisible;
    }
    ui.status.textContent = `Undo: overlay ${nextOverlay === undefined ? "cleared" : "restored"}`;
    render();
    syncPoseEditorToSelection();
    return true;
  };

  const pixelPointForEditorPoint = (point) => {
    const frame = currentFrame(state);
    if (frame === null) {
      return null;
    }
    const center = overlayCenterForFrame(ui, state, frame, metaForKey);
    return spritePixelPointForEditorPoint(state, point, center.x, center.y);
  };

  const updatePixelPreviewAtEditorPoint = (point) => {
    const frame = currentFrame(state);
    if (frame === null) {
      clearPixelPreview();
      return;
    }
    const pixelPoint = pixelPointForEditorPoint(point);
    if (pixelPoint === null) {
      clearPixelPreview();
      return;
    }
    const size = brushSize(ui);
    const half = Math.floor(size / 2);
    const startX = Math.round(pixelPoint.u) - half;
    const startY = Math.round(pixelPoint.v) - half;
    state.pixelPreview.active = true;
    state.pixelPreview.frameIndex = state.currentFrameIndex;
    state.pixelPreview.startX = startX;
    state.pixelPreview.startY = startY;
    state.pixelPreview.size = size;
    state.pixelPreview.isErase = state.editorMode === "erase";
  };

  const paintPixelAtEditorPoint = async (point) => {
    const frame = currentFrame(state);
    if (frame === null) {
      return;
    }
    await ensurePixelCanvasForPose();
    const pixelDraw = state.pixelDraw;
    if (pixelDraw.ctx === null || pixelDraw.canvas === null) {
      return;
    }
    const pixelPoint = pixelPointForEditorPoint(point);
    if (pixelPoint === null) {
      return;
    }
    updatePixelPreviewAtEditorPoint(point);
    const changed = stampBrushOnPixelCanvas(pixelDraw.ctx, pixelPoint);
    if (changed) {
      pixelDraw.brushDirty = true;
      render();
    }
  };

  const sampleOverlayColor = async (point) => {
    await ensurePixelCanvasForPose();
    const pixelDraw = state.pixelDraw;
    if (pixelDraw.ctx === null) {
      return null;
    }
    const pixelPoint = pixelPointForEditorPoint(point);
    if (pixelPoint === null) {
      return null;
    }
    const x = Math.round(pixelPoint.u);
    const y = Math.round(pixelPoint.v);
    if (x < 0 || y < 0 || x >= overlaySizePx || y >= overlaySizePx) {
      return null;
    }
    const data = pixelDraw.ctx.getImageData(x, y, 1, 1).data;
    if (data[3] <= 0) {
      return null;
    }
    return { r: data[0], g: data[1], b: data[2], a: data[3] };
  };

  const sampleSceneColor = (point) => {
    if (state.ctx === null) {
      return null;
    }
    const x = Math.max(0, Math.min(ui.scene.width - 1, Math.round(point.x)));
    const y = Math.max(0, Math.min(ui.scene.height - 1, Math.round(point.y)));
    const data = state.ctx.getImageData(x, y, 1, 1).data;
    if (data[3] <= 0) {
      return null;
    }
    return { r: data[0], g: data[1], b: data[2], a: data[3] };
  };

  const pickColorAtEditorPoint = async (point) => {
    const overlayColor = await sampleOverlayColor(point);
    const color = overlayColor ?? sampleSceneColor(point);
    if (color === null) {
      ui.status.textContent = "Pick: no visible color";
      resetPixelDraw();
      render();
      return;
    }
    ui.brushColor.value = colorToHex(color.r, color.g, color.b);
    ui.status.textContent = `Picked ${ui.brushColor.value}`;
    resetPixelDraw();
    setModeDraw();
  };

  const bindDrawingHandlers = () => {
    ui.modeDraw.addEventListener("click", () => {
      setModeDraw();
    });
    ui.modeSelect.addEventListener("click", () => {
      setModeSelect();
    });
    ui.modeErase.addEventListener("click", () => {
      setModeErase();
    });
    ui.modeEyedropper.addEventListener("click", () => {
      setModeEyedropper();
    });
    ui.undoOverlay.addEventListener("click", () => {
      undoOverlayDraw();
    });
    ui.brushSize.addEventListener("change", () => {
      ui.brushSize.value = String(brushSize(ui));
    });
  };

  return {
    bindDrawingHandlers,
    commitPixelDraw,
    isDrawMode,
    isEyedropperMode,
    paintPixelAtEditorPoint,
    pickColorAtEditorPoint,
    updatePixelPreviewAtEditorPoint,
    clearPixelPreview,
    setModeDraw,
    setModeErase,
    setModeEyedropper,
    setModeSelect,
    undoOverlayDraw,
  };
};
