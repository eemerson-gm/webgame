import {
  DEFAULT_ANCHOR_PRESET,
  isAnchorPreset,
} from "../animations/jsonSpriteAnimation/anchorEditor.js";

const normalizePose = (pose) => {
  const next = { ...pose };
  if (!isAnchorPreset(next.anchor)) {
    next.anchor = DEFAULT_ANCHOR_PRESET;
  }
  return next;
};

export const normalizeSpec = (spec) => {
  const next = spec;
  next.frames = next.frames ?? [];
  next.frames = next.frames.map((frame) => {
    const sprites = (frame.sprites ?? []).map(normalizePose);
    return { ...frame, sprites };
  });
  const rawSpeed = Number(next.speed ?? 1);
  next.speed = Number.isFinite(rawSpeed) && rawSpeed > 0 ? rawSpeed : 1;
  return next;
};

export const POSE_PART_IDS = ["body", "weapon", "hat"];

export const isPosePartId = (id) => POSE_PART_IDS.includes(id);

export const poseIdsInFrame = (frame) =>
  new Set(frame.sprites.map((pose) => pose.id));

export const firstAvailablePosePartId = (frame) => {
  const taken = poseIdsInFrame(frame);
  return POSE_PART_IDS.find((partId) => !taken.has(partId)) ?? null;
};

export const spriteUrlToKey = (entry) => entry.key;

export const animationTemplateSpec = (state) => {
  const frameDurationMs = state.spec?.frameDurationMs ?? 120;
  const speed = state.spec?.speed ?? 1;
  const mirrorWidth = state.spec?.mirrorWidth ?? 16;
  return {
    frameDurationMs,
    speed,
    mirrorWidth,
    frames: [{ sprites: [] }],
  };
};

export const ensureAnimationIdEndsWithJson = (id) => {
  const trimmed = String(id ?? "").trim();
  if (!trimmed) {
    return "";
  }
  const hasJson = trimmed.toLowerCase().endsWith(".json");
  return hasJson ? trimmed : `${trimmed}.json`;
};
