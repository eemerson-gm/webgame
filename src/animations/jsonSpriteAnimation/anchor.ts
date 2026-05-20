import * as ex from "excalibur";
import type { JsonSpriteAnchorPreset, JsonSpritePose } from "./types";

export const ANCHOR_PRESET_IDS: readonly JsonSpriteAnchorPreset[] = [
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

export const DEFAULT_ANCHOR_PRESET: JsonSpriteAnchorPreset = "center";

type AnchorVec = { x: number; y: number };

const ANCHOR_VEC_BY_PRESET: Record<JsonSpriteAnchorPreset, AnchorVec> = {
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

export const isAnchorPreset = (
  preset: string | undefined,
): preset is JsonSpriteAnchorPreset =>
  ANCHOR_PRESET_IDS.includes(preset as JsonSpriteAnchorPreset);

export const anchorVecForPreset = (
  preset: JsonSpriteAnchorPreset | undefined,
): AnchorVec => {
  const resolved = isAnchorPreset(preset) ? preset : DEFAULT_ANCHOR_PRESET;
  return ANCHOR_VEC_BY_PRESET[resolved];
};

export const anchorVecForPose = (pose: JsonSpritePose): AnchorVec =>
  anchorVecForPreset(pose.anchor);

export const mirrorAnchorVecX = (vec: AnchorVec): AnchorVec => ({
  x: 1 - vec.x,
  y: vec.y,
});

export const anchorVecForPoseFacing = (
  pose: JsonSpritePose,
  facingLeft: boolean,
): AnchorVec => {
  const vec = anchorVecForPose(pose);
  return facingLeft ? mirrorAnchorVecX(vec) : vec;
};

export const anchorPixelOffset = (
  width: number,
  height: number,
  vec: AnchorVec,
): AnchorVec => ({
  x: vec.x * width,
  y: vec.y * height,
});

export const spriteOriginForImage = (
  image: ex.ImageSource,
  vec: AnchorVec,
): ex.Vector => {
  const sprite = image.toSprite();
  return ex.vec(sprite.width * vec.x, sprite.height * vec.y);
};

export const spriteForImageWithAnchor = (
  image: ex.ImageSource,
  vec: AnchorVec,
): ex.Sprite => {
  const sprite = image.toSprite();
  sprite.origin = ex.vec(sprite.width * vec.x, sprite.height * vec.y);
  return sprite;
};

export const excaliburAnchorForVec = (vec: AnchorVec): ex.Vector =>
  ex.vec(vec.x, vec.y);
