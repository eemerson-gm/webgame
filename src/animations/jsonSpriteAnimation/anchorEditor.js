export const ANCHOR_PRESET_IDS = [
  "topLeft",
  "topMiddle",
  "topRight",
  "middleLeft",
  "center",
  "middleRight",
  "bottomLeft",
  "bottomMiddle",
  "bottomRight",
];

export const DEFAULT_ANCHOR_PRESET = "center";

const ANCHOR_VEC_BY_PRESET = {
  topLeft: { x: 0, y: 0 },
  topMiddle: { x: 0.5, y: 0 },
  topRight: { x: 1, y: 0 },
  middleLeft: { x: 0, y: 0.5 },
  center: { x: 0.5, y: 0.5 },
  middleRight: { x: 1, y: 0.5 },
  bottomLeft: { x: 0, y: 1 },
  bottomMiddle: { x: 0.5, y: 1 },
  bottomRight: { x: 1, y: 1 },
};

export const isAnchorPreset = (preset) => ANCHOR_PRESET_IDS.includes(preset);

export const anchorVecForPreset = (preset) => {
  const resolved = isAnchorPreset(preset) ? preset : DEFAULT_ANCHOR_PRESET;
  return ANCHOR_VEC_BY_PRESET[resolved];
};

export const anchorVecForPose = (pose) => anchorVecForPreset(pose?.anchor);

export const mirrorAnchorVecX = (vec) => ({
  x: 1 - vec.x,
  y: vec.y,
});

export const anchorVecForPoseFacing = (pose, facingLeft) => {
  const vec = anchorVecForPose(pose);
  return facingLeft ? mirrorAnchorVecX(vec) : vec;
};

export const anchorPixelOffset = (width, height, vec) => ({
  x: vec.x * width,
  y: vec.y * height,
});
