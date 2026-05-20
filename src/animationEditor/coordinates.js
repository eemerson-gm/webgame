import {
  anchorPixelOffset,
  anchorVecForPose,
} from "../animations/jsonSpriteAnimation/anchorEditor.js";

export const degToRad = (deg) => (deg * Math.PI) / 180;

export const pointInPoseBounds = (point, pose, meta, o, zoom) => {
  const anchorPos = centerForPose(pose);
  const anchorPx = anchorPixelOffset(meta.width, meta.height, anchorVecForPose(pose));
  const pxPos = o.x + anchorPos.centerX * zoom;
  const pyPos = o.y + anchorPos.centerY * zoom;
  const dx = point.x - pxPos;
  const dy = point.y - pyPos;
  const rot = -degToRad(pose.rotationDeg ?? 0);
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const localX = dx * cos - dy * sin;
  const localY = dx * sin + dy * cos;
  const left = -anchorPx.x * zoom;
  const top = -anchorPx.y * zoom;
  const right = left + meta.width * zoom;
  const bottom = top + meta.height * zoom;
  return localX >= left && localX <= right && localY >= top && localY <= bottom;
};

export const canvasPointForEvent = (ui, event) => {
  const rect = ui.scene.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  return { x, y };
};

export const origin = (ui) => ({ x: ui.scene.width / 2, y: ui.scene.height / 2 });

export const centerForPose = (pose) => ({
  centerX: pose.offset.x,
  centerY: pose.offset.y,
});

export const overlayCenterForFrame = (ui, state, frame, spriteMetaForKey) => {
  const o = origin(ui);
  const hostPoseForOverlay =
    frame.sprites.find((p) => p.id === "body") ?? frame.sprites[0] ?? null;
  if (hostPoseForOverlay === null) {
    return o;
  }
  const meta = spriteMetaForKey(hostPoseForOverlay.spriteKey);
  if (meta === null) {
    return o;
  }
  const centered = centerForPose(hostPoseForOverlay);
  return {
    x: o.x + centered.centerX * state.zoom,
    y: o.y + centered.centerY * state.zoom,
  };
};
