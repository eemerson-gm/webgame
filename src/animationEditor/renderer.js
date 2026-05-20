import {
  anchorPixelOffset,
  anchorVecForPose,
} from "../animations/jsonSpriteAnimation/anchorEditor.js";
import { centerForPose, degToRad, origin, overlayCenterForFrame } from "./coordinates.js";
import { currentFrame, spriteMetaForKey } from "./state.js";

export const createRenderer = ({ state, ui }) => {
  const metaForKey = (spriteKey) => spriteMetaForKey(state, spriteKey);

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
        const centered = centerForPose(pose);
        const img = imgForPosePreview(pose, meta, render);
        const w2 = meta.width;
        const h2 = meta.height;
        const anchorPx = anchorPixelOffset(w2, h2, anchorVecForPose(pose));
        const pxPos = Math.round(o.x + centered.centerX * state.zoom);
        const pyPos = Math.round(o.y + centered.centerY * state.zoom);
        const rot = degToRad(pose.rotationDeg ?? 0);

        ctx.save();
        ctx.translate(pxPos, pyPos);
        ctx.rotate(rot);
        ctx.drawImage(
          img,
          -anchorPx.x * state.zoom,
          -anchorPx.y * state.zoom,
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
    renderSpriteGuides(frame, o);
    renderHelp(frame);
  };

  const imgForPosePreview = (pose, meta, renderNext) => {
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
    if (frame.overlayPixelDataUrl === undefined) {
      return;
    }
    const center = overlayCenterForFrame(ui, state, frame, metaForKey);
    const overlayDataUrl = frame.overlayPixelDataUrl;
    const cached = state.pixelCanvasByDataUrl[overlayDataUrl];
    const overlayAlpha = alpha ?? 1;
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

  const drawPoseGuides = (ctx, pose, meta, o, isSelected) => {
    const centered = centerForPose(pose);
    const anchorPx = anchorPixelOffset(meta.width, meta.height, anchorVecForPose(pose));
    const boxW = meta.width * state.zoom;
    const boxH = meta.height * state.zoom;
    const pxPos = Math.round(o.x + centered.centerX * state.zoom);
    const pyPos = Math.round(o.y + centered.centerY * state.zoom);
    const rot = degToRad(pose.rotationDeg ?? 0);
    const anchorRadius = isSelected === true ? 4 : 3;

    ctx.save();
    ctx.translate(pxPos, pyPos);
    ctx.rotate(rot);
    ctx.strokeStyle = isSelected === true ? "rgba(220,0,0,0.85)" : "rgba(255,170,0,0.95)";
    ctx.lineWidth = isSelected === true ? 2 : 1;
    ctx.strokeRect(-anchorPx.x * state.zoom, -anchorPx.y * state.zoom, boxW, boxH);
    ctx.fillStyle = isSelected === true ? "rgba(220,0,0,0.95)" : "rgba(255,170,0,0.95)";
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, anchorRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  };

  const renderSpriteGuides = (frame, o) => {
    const ctx = state.ctx;
    if (ctx === null) {
      return;
    }
    const selectedId = state.selectedPoseId;
    const posesSorted = frame.sprites
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
      drawPoseGuides(ctx, pose, meta, o, pose.id === selectedId);
    });
  };

  const renderHelp = (frame) => {
    const selectedPose = state.selectedPoseId
      ? (frame.sprites.find((p) => p.id === state.selectedPoseId) ?? null)
      : null;
    if (selectedPose === null) {
      ui.renderHelp.textContent = `Frame ${state.currentFrameIndex}. Drag to add a pose. Click to select.`;
      return;
    }
    ui.renderHelp.textContent = `Frame ${state.currentFrameIndex}. Selected: ${selectedPose.id} (${selectedPose.spriteKey}) Offset(${selectedPose.offset.x}, ${selectedPose.offset.y}) Anchor(${selectedPose.anchor ?? "center"}) Rot(${selectedPose.rotationDeg}) Layer(${selectedPose.layer ?? 0}). Drag to move.`;
  };

  return { render };
};
