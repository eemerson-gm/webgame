export const degToRad = (deg) => (deg * Math.PI) / 180;

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

export const spritePixelPointForEditorPoint = (
  state,
  point,
  overlayCenterX,
  overlayCenterY,
) => {
  const dx = (point.x - overlayCenterX) / state.zoom;
  const dy = (point.y - overlayCenterY) / state.zoom;
  return { u: dx + 64, v: dy + 64 };
};

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
