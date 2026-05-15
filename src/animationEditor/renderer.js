import { centerForPose, degToRad, origin, overlayCenterForFrame } from "./coordinates.js";
import { currentFrame, spriteMetaForKey } from "./state.js";

export const createRenderer = ({ state, ui }) => {
  const metaForKey = (spriteKey) => spriteMetaForKey(state, spriteKey);
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

  const render = () => {
    const ctx = state.ctx;
    if (ctx === null) {
      return;
    }
    ctx.clearRect(0, 0, ui.scene.width, ui.scene.height);
    const o = origin(ui);
    ctx.save();
    ctx.strokeStyle = "rgba(0,0,0,0.06)";
    ctx.lineWidth = 1;
    const w = ui.scene.width;
    const h = ui.scene.height;
    const grid = 32;
    Array.from({ length: Math.ceil(w / grid) }).forEach((_, i) => {
      const x = i * grid;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    });
    Array.from({ length: Math.ceil(h / grid) }).forEach((_, i) => {
      const y = i * grid;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    });
    ctx.restore();

    const frame = currentFrame(state);
    if (frame === null) {
      return;
    }

    const onionEnabled =
      ui.onionSkinPrev !== undefined &&
      ui.onionSkinPrev.checked === true &&
      state.editorMode !== "eyedropper" &&
      state.currentFrameIndex > 0;
    const onionOpacityRaw = Number(ui.onionSkinOpacity?.value ?? 0.25);
    const onionOpacity = Math.max(0, Math.min(1, onionOpacityRaw));

    const drawFrame = (frameToDraw, alpha) => {
      if (alpha !== 1) {
        ctx.save();
        ctx.globalAlpha = alpha;
      }
      const posesSorted = frameToDraw.sprites
        .slice()
        .sort((a, b) => (a.layer ?? 0) - (b.layer ?? 0));
      posesSorted.forEach((pose) => {
        if (pose.visible === false) {
          return;
        }
        const meta = metaForKey(pose.spriteKey);
        if (meta === null) {
          return;
        }
        const centered = centerForPose(pose, meta);
        const img = imgForPosePreview(pose, meta, render);
        const w2 = meta.width;
        const h2 = meta.height;
        const pxPos = Math.round(o.x + centered.centerX * state.zoom);
        const pyPos = Math.round(o.y + centered.centerY * state.zoom);
        const rot = degToRad(pose.rotationDeg ?? 0);

        ctx.save();
        ctx.translate(pxPos, pyPos);
        ctx.rotate(rot);
        ctx.drawImage(
          img,
          (-w2 / 2) * state.zoom,
          (-h2 / 2) * state.zoom,
          w2 * state.zoom,
          h2 * state.zoom,
        );
        ctx.restore();
      });
      renderOverlay(frameToDraw, render, alpha);
      if (alpha !== 1) {
        ctx.restore();
      }
    };

    if (onionEnabled) {
      const prevFrame = state.spec?.frames[state.currentFrameIndex - 1] ?? null;
      if (prevFrame !== null) {
        drawFrame(prevFrame, onionOpacity);
      }
    }

    drawFrame(frame, 1);
    renderPixelPreview();
    renderSelection(frame, o);
    renderHelp(frame);
  };

  const imgForPosePreview = (pose, meta, renderNext) => {
    const pixelDraw = state.pixelDraw;
    const matchesPixelDraw =
      pixelDraw.active === true &&
      pixelDraw.frameIndex === state.currentFrameIndex &&
      pixelDraw.poseId === pose.id &&
      pixelDraw.canvas !== null;
    if (matchesPixelDraw) {
      return pixelDraw.canvas;
    }
    if (pose.pixelDataUrl === undefined) {
      return meta.img;
    }
    const cached = state.pixelCanvasByDataUrl[pose.pixelDataUrl];
    if (cached !== undefined && cached !== null) {
      return cached;
    }
    if (cached === undefined) {
      state.pixelCanvasByDataUrl[pose.pixelDataUrl] = null;
      const img = new Image();
      img.src = pose.pixelDataUrl;
      img.onload = () => {
        state.pixelCanvasByDataUrl[pose.pixelDataUrl] = img;
        renderNext();
      };
      img.onerror = () => {
        delete state.pixelCanvasByDataUrl[pose.pixelDataUrl];
        renderNext();
      };
      return meta.img;
    }
    return meta.img;
  };

  const drawOverlayImage = (ctx, img, center) => {
    ctx.save();
    ctx.translate(Math.round(center.x), Math.round(center.y));
    ctx.drawImage(
      img,
      -64 * state.zoom,
      -64 * state.zoom,
      128 * state.zoom,
      128 * state.zoom,
    );
    ctx.restore();
  };

  const renderOverlay = (frame, renderNext, alpha) => {
    const overlayVisible = frame.overlayVisible !== false;
    if (!overlayVisible) {
      return;
    }
    if (state.ctx === null) {
      return;
    }
    const center = overlayCenterForFrame(ui, state, frame, metaForKey);
    const renderedIsCurrentFrame = frame === currentFrame(state);
    const overlayIsInProgress =
      state.pixelDraw.active === true &&
      state.pixelDraw.frameIndex === state.currentFrameIndex &&
      state.pixelDraw.canvas !== null &&
      renderedIsCurrentFrame;
    const overlayDrawable = overlayIsInProgress ? state.pixelDraw.canvas : null;
    const overlayAlpha = alpha ?? 1;
    if (overlayDrawable !== null) {
      state.ctx.save();
      state.ctx.globalAlpha = overlayAlpha;
      drawOverlayImage(state.ctx, overlayDrawable, center);
      state.ctx.restore();
      return;
    }
    if (frame.overlayPixelDataUrl === undefined) {
      return;
    }
    const overlayDataUrl = frame.overlayPixelDataUrl;
    const cached = state.pixelCanvasByDataUrl[overlayDataUrl];
    if (cached !== undefined && cached !== null) {
      state.ctx.save();
      state.ctx.globalAlpha = overlayAlpha;
      drawOverlayImage(state.ctx, cached, center);
      state.ctx.restore();
    }
    if (cached === undefined) {
      state.pixelCanvasByDataUrl[overlayDataUrl] = null;
      const img = new Image();
      img.src = overlayDataUrl;
      img.onload = () => {
        state.pixelCanvasByDataUrl[overlayDataUrl] = img;
        renderNext();
      };
      img.onerror = () => {
        delete state.pixelCanvasByDataUrl[overlayDataUrl];
        renderNext();
      };
    }
  };

  const renderSelection = (frame, o) => {
    const selected = state.selectedPoseId;
    if (!selected) {
      return;
    }
    const pose = frame.sprites.find((p) => p.id === selected);
    if (pose === undefined) {
      return;
    }
    const meta = metaForKey(pose.spriteKey);
    if (meta === null) {
      return;
    }
    const centered = centerForPose(pose, meta);
    const r = (Math.max(meta.width, meta.height) / 2) * state.zoom;
    const cx = Math.round(o.x + centered.centerX * state.zoom);
    const cy = Math.round(o.y + centered.centerY * state.zoom);
    state.ctx.save();
    state.ctx.strokeStyle = "rgba(220,0,0,0.85)";
    state.ctx.lineWidth = 2;
    state.ctx.beginPath();
    state.ctx.arc(cx, cy, r, 0, Math.PI * 2);
    state.ctx.stroke();
    state.ctx.restore();
  };

  const renderPixelPreview = () => {
    const preview = state.pixelPreview;
    if (preview.active !== true) {
      return;
    }
    if (preview.frameIndex !== state.currentFrameIndex) {
      return;
    }
    const frame = currentFrame(state);
    if (frame === null) {
      return;
    }
    const center = overlayCenterForFrame(ui, state, frame, metaForKey);
    const zoom = state.zoom;
    const topLeftX = center.x - 64 * zoom;
    const topLeftY = center.y - 64 * zoom;

    const color = hexToColor(ui.brushColor?.value ?? "#ff0000");
    const previewAlpha = preview.isErase ? 0.25 : 0.35;

    state.ctx.save();
    state.ctx.globalAlpha = previewAlpha;

    const drawPixel = (x, y) => {
      const rx = Math.round(topLeftX + x * zoom);
      const ry = Math.round(topLeftY + y * zoom);
      const size = Math.max(1, Math.round(zoom));
      state.ctx.fillStyle = preview.isErase
        ? "rgba(230,230,230,1)"
        : `rgba(${color.r},${color.g},${color.b},1)`;
      if (preview.isErase === true) {
        state.ctx.fillRect(rx, ry, size, size);
        state.ctx.strokeStyle = "rgba(255,255,255,0.75)";
        state.ctx.lineWidth = 1;
        const inner = Math.max(0, size - 1);
        state.ctx.strokeRect(rx + 0.5, ry + 0.5, inner, inner);
        return;
      }
      state.ctx.fillRect(rx, ry, size, size);
    };

    const xStart = preview.startX;
    const yStart = preview.startY;
    const xEnd = xStart + preview.size;
    const yEnd = yStart + preview.size;

    Array.from({ length: preview.size }).forEach((_, yIndex) => {
      Array.from({ length: preview.size }).forEach((__, xIndex) => {
        const x = xStart + xIndex;
        const y = yStart + yIndex;
        if (x < 0 || y < 0 || x >= 128 || y >= 128) {
          return;
        }
        drawPixel(x, y);
      });
    });

    state.ctx.restore();
  };

  const renderHelp = (frame) => {
    const selectedPose = state.selectedPoseId
      ? (frame.sprites.find((p) => p.id === state.selectedPoseId) ?? null)
      : null;
    if (selectedPose === null) {
      ui.renderHelp.textContent = `Frame ${state.currentFrameIndex}. Drag to add a pose. Click to select.`;
      return;
    }
    ui.renderHelp.textContent = `Frame ${state.currentFrameIndex}. Selected: ${selectedPose.id} (${selectedPose.spriteKey}) Offset(${selectedPose.offset.x}, ${selectedPose.offset.y}) Rot(${selectedPose.rotationDeg}) Layer(${selectedPose.layer ?? 0}). Drag to move.`;
  };

  return { render };
};
