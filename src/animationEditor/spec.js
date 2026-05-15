export const normalizeSpec = (spec) => {
  const next = spec;
  next.frames = next.frames ?? [];
  next.frames = next.frames.map((frame) => {
    const sprites = frame.sprites ?? [];
    return { ...frame, sprites };
  });
  const rawSpeed = Number(next.speed ?? 1);
  next.speed = Number.isFinite(rawSpeed) && rawSpeed > 0 ? rawSpeed : 1;
  return next;
};

export const uniqueIdFor = (baseId, existingIds, suffix) => {
  if (!existingIds.has(baseId)) {
    return baseId;
  }
  return `${baseId}_${suffix}`;
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
