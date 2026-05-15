const el = (id) => {
  const node = document.getElementById(id);
  if (node === null) {
    throw new Error(`Missing element: ${id}`);
  }
  return node;
};

const degToRad = (deg) => (deg * Math.PI) / 180;

const normalizeSpec = (spec) => {
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

const uniqueIdFor = (baseId, existingIds, suffix) => {
  if (!existingIds.has(baseId)) {
    return baseId;
  }
  return `${baseId}_${suffix}`;
};

const spriteUrlToKey = (entry) => entry.key;

const appState = {
  sprites: [],
  spritesByKey: {},
  animations: [],
  spec: null,
  animationId: null,
  currentFrameIndex: 0,
  selectedPoseId: null,
  selectedPoseIndex: -1,
  copiedPose: null,
  canvas: null,
  ctx: null,
  isDragging: false,
  isPlaying: false,
  playbackTimerId: null,
  drag: { active: false, pointerOffsetX: 0, pointerOffsetY: 0 },
  zoom: 2,
};

const ui = {
  status: el("status"),
  saveStatus: el("save-status"),
  animationSelect: el("animation-select"),
  newAnimationId: el("new-animation-id"),
  newAnimationCreate: el("new-animation-create"),
  frameIndex: el("frame-index"),
  framePrev: el("frame-prev"),
  frameNext: el("frame-next"),
  frameAddEmpty: el("frame-add-empty"),
  frameAddDuplicate: el("frame-add-duplicate"),
  frameDelete: el("frame-delete"),
  save: el("save"),
  spriteList: el("sprite-list"),
  scene: el("scene"),
  sceneHint: el("scene-hint"),
  play: el("play"),
  stop: el("stop"),
  animationSpeed: el("animation-speed"),
  poseNone: el("pose-none"),
  poseEditor: el("pose-editor"),
  poseId: el("pose-id"),
  poseSpriteKey: el("pose-spriteKey"),
  poseOffsetX: el("pose-offsetX"),
  poseOffsetY: el("pose-offsetY"),
  poseRotationDeg: el("pose-rotationDeg"),
  poseLayer: el("pose-layer"),
  poseVisible: el("pose-visible"),
  poseRemove: el("pose-remove"),
  poseCopy: el("pose-copy"),
  posePaste: el("pose-paste"),
  renderHelp: el("render-help"),
};

const canvasPointForEvent = (event) => {
  const rect = ui.scene.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  return { x, y };
};

const origin = () => ({ x: ui.scene.width / 2, y: ui.scene.height / 2 });

const currentFrame = () => {
  const spec = appState.spec;
  if (spec === null) {
    return null;
  }
  return spec.frames[appState.currentFrameIndex] ?? null;
};

const updateSelectedFromId = () => {
  const frame = currentFrame();
  if (frame === null) {
    appState.selectedPoseId = null;
    appState.selectedPoseIndex = -1;
    return;
  }
  const idx = appState.selectedPoseId
    ? frame.sprites.findIndex((p) => p.id === appState.selectedPoseId)
    : -1;
  appState.selectedPoseIndex = idx;
  if (idx < 0) {
    appState.selectedPoseId = null;
  }
};

const existingPoseIds = () => {
  const spec = appState.spec;
  if (spec === null) {
    return new Set();
  }
  const ids = spec.frames.flatMap((f) => f.sprites.map((p) => p.id));
  return new Set(ids);
};

const spriteMetaForKey = (spriteKey) => appState.spritesByKey[spriteKey] ?? null;

const centerForPose = (pose, meta) => {
  const centerX = pose.offset.x - meta.width / 2;
  const centerY = pose.offset.y - meta.height / 2;
  return { centerX, centerY };
};

const runtimeOffsetForEditor = (editorOffset, meta) => {
  const next = {
    x: editorOffset.x + meta.width / 2,
    y: editorOffset.y + meta.height / 2,
  };
  return next;
};

const editorOffsetForRuntime = (runtimeOffset, meta) => {
  const next = {
    x: runtimeOffset.x - meta.width / 2,
    y: runtimeOffset.y - meta.height / 2,
  };
  return next;
};

const render = () => {
  const ctx = appState.ctx;
  if (ctx === null) {
    return;
  }
  ctx.clearRect(0, 0, ui.scene.width, ui.scene.height);
  const o = origin();
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

  const frame = currentFrame();
  if (frame === null) {
    return;
  }
  const posesSorted = frame.sprites
    .slice()
    .sort((a, b) => (a.layer ?? 0) - (b.layer ?? 0));

  posesSorted.forEach((pose) => {
    if (pose.visible === false) {
      return;
    }
    const meta = spriteMetaForKey(pose.spriteKey);
    if (meta === null) {
      return;
    }
    const centered = centerForPose(pose, meta);
    const img = meta.img;
    const w2 = meta.width;
    const h2 = meta.height;
    const pxPos = Math.round(o.x + centered.centerX * appState.zoom);
    const pyPos = Math.round(o.y + centered.centerY * appState.zoom);
    const rot = degToRad(pose.rotationDeg ?? 0);

    ctx.save();
    ctx.translate(pxPos, pyPos);
    ctx.rotate(rot);
    ctx.drawImage(
      img,
      (-w2 / 2) * appState.zoom,
      (-h2 / 2) * appState.zoom,
      w2 * appState.zoom,
      h2 * appState.zoom,
    );
    ctx.restore();
  });

  const selected = appState.selectedPoseId;
  if (selected) {
    const pose = frame.sprites.find((p) => p.id === selected);
    if (pose) {
      const meta = spriteMetaForKey(pose.spriteKey);
      if (meta !== null) {
        const centered = centerForPose(pose, meta);
        const r =
          (Math.max(meta.width, meta.height) / 2) * appState.zoom;
        const cx = Math.round(o.x + centered.centerX * appState.zoom);
        const cy = Math.round(o.y + centered.centerY * appState.zoom);
        ctx.save();
        ctx.strokeStyle = "rgba(220,0,0,0.85)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  const frameForHelp = currentFrame();
  if (frameForHelp === null) {
    ui.renderHelp.textContent = "";
    return;
  }
  const selectedPose = appState.selectedPoseId
    ? frameForHelp.sprites.find((p) => p.id === appState.selectedPoseId) ??
      null
    : null;
  if (selectedPose === null) {
    ui.renderHelp.textContent = `Frame ${appState.currentFrameIndex}. Drag to add a pose. Click to select.`;
    return;
  }
  ui.renderHelp.textContent = `Frame ${appState.currentFrameIndex}. Selected: ${selectedPose.id} (${selectedPose.spriteKey}) Offset(${selectedPose.offset.x}, ${selectedPose.offset.y}) Rot(${selectedPose.rotationDeg}) Layer(${selectedPose.layer ?? 0}). Drag to move+rotate.`;
};

const setPoseEditorEnabled = (enabled) => {
  ui.poseEditor.hidden = !enabled;
  ui.poseNone.hidden = enabled;
};

const syncPoseEditorToSelection = () => {
  const frame = currentFrame();
  updateSelectedFromId();
  if (frame === null) {
    setPoseEditorEnabled(false);
    return;
  }
  const idx = appState.selectedPoseIndex;
  if (idx < 0) {
    setPoseEditorEnabled(false);
    return;
  }
  const pose = frame.sprites[idx];
  const meta = spriteMetaForKey(pose.spriteKey);
  ui.poseId.value = pose.id;
  ui.poseSpriteKey.innerHTML = "";
  const allKeys = appState.sprites.map(spriteUrlToKey);
  allKeys.forEach((k) => {
    const opt = document.createElement("option");
    opt.value = k;
    opt.textContent = k;
    if (k === pose.spriteKey) {
      opt.selected = true;
    }
    ui.poseSpriteKey.appendChild(opt);
  });
  ui.poseSpriteKey.value = pose.spriteKey;
  if (meta === null) {
    ui.poseOffsetX.value = String(pose.offset.x);
    ui.poseOffsetY.value = String(pose.offset.y);
  } else {
    const editorOffset = editorOffsetForRuntime(pose.offset, meta);
    ui.poseOffsetX.value = String(editorOffset.x);
    ui.poseOffsetY.value = String(editorOffset.y);
  }
  ui.poseRotationDeg.value = String(pose.rotationDeg ?? 0);
  ui.poseLayer.value = String(pose.layer ?? 0);
  ui.poseVisible.checked = pose.visible !== false;
  setPoseEditorEnabled(true);
};

const setSelectedPoseByCanvasHit = (point) => {
  const frame = currentFrame();
  if (frame === null) {
    return;
  }
  const o = origin();
  const posesSorted = frame.sprites
    .slice()
    .sort((a, b) => (b.layer ?? 0) - (a.layer ?? 0));
  const hit = posesSorted
    .map((pose) => {
      const meta = spriteMetaForKey(pose.spriteKey);
      if (meta === null) {
        return null;
      }
      const centered = centerForPose(pose, meta);
      const dx = point.x - (o.x + centered.centerX * appState.zoom);
      const dy = point.y - (o.y + centered.centerY * appState.zoom);
      const r = (Math.max(meta.width, meta.height) / 2) * appState.zoom;
      const dist2 = dx * dx + dy * dy;
      const hit = dist2 <= r * r;
      return hit ? pose : null;
    })
    .find((x) => x !== null);

  appState.selectedPoseId = hit ? hit.id : null;
  updateSelectedFromId();
};

const poseUpdateForDrag = (point) => {
  const frame = currentFrame();
  if (frame === null) {
    return;
  }
  const idx = appState.selectedPoseIndex;
  if (idx < 0) {
    return;
  }
  const pose = frame.sprites[idx];
  const o = origin();
  const meta = spriteMetaForKey(pose.spriteKey);
  if (meta === null) {
    return;
  }
  const pointerRelX = (point.x - o.x) / appState.zoom;
  const pointerRelY = (point.y - o.y) / appState.zoom;
  const nextCenterX = pointerRelX + appState.drag.pointerOffsetX;
  const nextCenterY = pointerRelY + appState.drag.pointerOffsetY;
  pose.offset = runtimeOffsetForEditor(
    { x: Math.round(nextCenterX), y: Math.round(nextCenterY) },
    meta,
  );
};

const startDragForSelection = (point) => {
  const frame = currentFrame();
  if (frame === null) {
    appState.drag.active = false;
    return;
  }
  const idx = appState.selectedPoseIndex;
  if (idx < 0) {
    appState.drag.active = false;
    return;
  }
  const pose = frame.sprites[idx];
  const o = origin();
  const meta = spriteMetaForKey(pose.spriteKey);
  if (meta === null) {
    appState.drag.active = false;
    return;
  }
  const pointerRelX = (point.x - o.x) / appState.zoom;
  const pointerRelY = (point.y - o.y) / appState.zoom;
  const centered = centerForPose(pose, meta);
  appState.drag.pointerOffsetX = centered.centerX - pointerRelX;
  appState.drag.pointerOffsetY = centered.centerY - pointerRelY;
  appState.drag.active = true;
};

const updatePoseField = (updater) => {
  const frame = currentFrame();
  if (frame === null) {
    return;
  }
  updateSelectedFromId();
  const idx = appState.selectedPoseIndex;
  if (idx < 0) {
    return;
  }
  updater(frame.sprites[idx]);
};

const removeSelectedPose = () => {
  const frame = currentFrame();
  if (frame === null) {
    return;
  }
  updateSelectedFromId();
  const idx = appState.selectedPoseIndex;
  if (idx < 0) {
    return;
  }
  const removed = frame.sprites[idx];
  frame.sprites = frame.sprites.filter((p) => p !== removed);
  appState.selectedPoseId = null;
  appState.selectedPoseIndex = -1;
  render();
  syncPoseEditorToSelection();
};

const clonePoseForCopy = (pose) => {
  const nextOffset = pose.offset ?? { x: 0, y: 0 };
  return {
    spriteKey: pose.spriteKey,
    offset: { x: nextOffset.x, y: nextOffset.y },
    rotationDeg: pose.rotationDeg ?? 0,
    layer: pose.layer ?? 0,
    visible: pose.visible !== false,
  };
};

const copySelectedPose = () => {
  const frame = currentFrame();
  if (frame === null) {
    return;
  }
  updateSelectedFromId();
  const idx = appState.selectedPoseIndex;
  if (idx < 0) {
    return;
  }
  const pose = frame.sprites[idx];
  appState.copiedPose = clonePoseForCopy(pose);
  ui.status.textContent = "Copied pose";
};

const pasteCopiedPose = () => {
  const frame = currentFrame();
  if (frame === null) {
    return;
  }
  const copied = appState.copiedPose;
  if (copied === null) {
    ui.status.textContent = "Copy a pose first";
    return;
  }
  const meta = spriteMetaForKey(copied.spriteKey);
  if (meta === null) {
    ui.status.textContent = "Unknown spriteKey";
    return;
  }
  const existing = existingPoseIds();
  const suffix = frame.sprites.length + 1;
  const nextId = uniqueIdFor(copied.spriteKey, existing, suffix);
  const pose = {
    id: nextId,
    spriteKey: copied.spriteKey,
    offset: { x: copied.offset.x, y: copied.offset.y },
    rotationDeg: copied.rotationDeg ?? 0,
    layer: copied.layer ?? 0,
    visible: copied.visible !== false,
  };
  frame.sprites.push(pose);
  appState.selectedPoseId = pose.id;
  updateSelectedFromId();
  syncPoseEditorToSelection();
  render();
  ui.status.textContent = "Pasted pose";
};

const ensureIdConsistency = (oldId, newId) => {
  if (appState.spec === null) {
    return;
  }
  appState.spec.frames = appState.spec.frames.map((frame) => {
    const withoutNew = frame.sprites.filter((p) => p.id !== newId);
    const updated = withoutNew.map((p) =>
      p.id === oldId ? { ...p, id: newId } : p,
    );
    return { ...frame, sprites: updated };
  });
};

const ensureSpriteKeyConsistency = (poseId, spriteKey) => {
  if (appState.spec === null) {
    return;
  }
  appState.spec.frames = appState.spec.frames.map((frame) => {
    const updated = frame.sprites.map((p) =>
      p.id === poseId ? { ...p, spriteKey } : p,
    );
    return { ...frame, sprites: updated };
  });
};

const addPoseFromSpriteKey = (spriteKey, point) => {
  const frame = currentFrame();
  if (frame === null) {
    return;
  }
  const meta = spriteMetaForKey(spriteKey);
  if (meta === null) {
    return;
  }
  const o = origin();
  const editorX = Math.round((point.x - o.x) / appState.zoom);
  const editorY = Math.round((point.y - o.y) / appState.zoom);
  const existing = existingPoseIds();
  const suffix = frame.sprites.length + 1;
  const nextId = uniqueIdFor(spriteKey, existing, suffix);
  const pose = {
    id: nextId,
    spriteKey,
    offset: runtimeOffsetForEditor({ x: editorX, y: editorY }, meta),
    rotationDeg: 0,
    layer: 0,
    visible: true,
  };
  frame.sprites.push(pose);
  appState.selectedPoseId = pose.id;
  updateSelectedFromId();
  syncPoseEditorToSelection();
  render();
};

const loadSprites = async () => {
  const res = await fetch("/api/sprites");
  const data = await res.json();
  const sprites = data.sprites ?? [];
  appState.sprites = sprites.map((s) => ({ ...s }));
  const byKey = {};

  await Promise.all(
    appState.sprites.map(async (s) => {
      const img = new Image();
      img.src = s.url;
      await new Promise((resolve) => {
        img.onload = () => resolve();
        img.onerror = () => resolve();
      });
      byKey[s.key] = {
        key: s.key,
        url: s.url,
        img,
        width: img.naturalWidth || 16,
        height: img.naturalHeight || 16,
      };
    }),
  );

  appState.spritesByKey = byKey;
};

const renderSpriteList = () => {
  ui.spriteList.innerHTML = "";
  appState.sprites.forEach((sprite) => {
    const item = document.createElement("div");
    item.className = "sprite-item";
    item.draggable = true;
    item.dataset.spriteKey = sprite.key;
    item.addEventListener("dragstart", (event) => {
      if (event.dataTransfer === null) {
        return;
      }
      event.dataTransfer.setData("text/plain", sprite.key);
      event.dataTransfer.effectAllowed = "copy";
    });

    const meta = spriteMetaForKey(sprite.key);
    const w = meta ? Math.min(48, meta.width) : 48;
    const h = meta ? Math.min(48, meta.height) : 48;

    const img = document.createElement("img");
    img.src = sprite.url;
    img.width = w;
    img.height = h;
    img.alt = sprite.key;

    const label = document.createElement("div");
    label.textContent = sprite.key;

    item.appendChild(img);
    item.appendChild(label);
    ui.spriteList.appendChild(item);
  });
};

const loadAnimationsList = async () => {
  const res = await fetch("/api/animations");
  const data = await res.json();
  const animations = data.animations ?? [];
  appState.animations = animations;
  ui.animationSelect.innerHTML = "";
  animations.forEach((a) => {
    const opt = document.createElement("option");
    opt.value = a.id;
    opt.textContent = a.name;
    ui.animationSelect.appendChild(opt);
  });
};

const loadAnimationSpec = async (animationId) => {
  ui.status.textContent = "Loading animation...";
  ui.saveStatus.textContent = "";
  const res = await fetch(`/api/animations/${encodeURIComponent(animationId)}`);
  if (!res.ok) {
    ui.status.textContent = "Failed to load animation";
    return;
  }
  const json = await res.json();
  appState.spec = normalizeSpec(json);
  appState.animationId = animationId;
  appState.isPlaying = false;
  if (appState.playbackTimerId !== null) {
    window.clearInterval(appState.playbackTimerId);
    appState.playbackTimerId = null;
  }
  appState.currentFrameIndex = 0;
  appState.selectedPoseId = null;
  appState.selectedPoseIndex = -1;
  ui.frameIndex.value = "0";
  ui.animationSpeed.value = String(appState.spec?.speed ?? 1);
  if (appState.spec.frames.length === 0) {
    appState.spec.frames = [{ sprites: [] }];
  }
  ui.frameIndex.max = String(appState.spec.frames.length - 1);
  ui.status.textContent = `Loaded frames: ${appState.spec.frames.length}`;
  syncPoseEditorToSelection();
  render();
};

const saveAnimation = async () => {
  const animationId = appState.animationId;
  if (!animationId || appState.spec === null) {
    ui.saveStatus.textContent = "No animation loaded";
    return;
  }
  ui.saveStatus.textContent = "Saving...";
  const res = await fetch(
    `/api/animations/${encodeURIComponent(animationId)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(appState.spec),
    },
  );
  if (!res.ok) {
    ui.saveStatus.textContent = "Save failed";
    return;
  }
  ui.saveStatus.textContent = "Saved";
};

const animationTemplateSpec = () => {
  const frameDurationMs = appState.spec?.frameDurationMs ?? 120;
  const speed = appState.spec?.speed ?? 1;
  const strategy = appState.spec?.strategy ?? "loop";
  const mirrorWidth = appState.spec?.mirrorWidth ?? 16;
  return {
    frameDurationMs,
    speed,
    strategy,
    mirrorWidth,
    frames: [{ sprites: [] }],
  };
};

const ensureAnimationIdEndsWithJson = (id) => {
  const trimmed = String(id ?? "").trim();
  if (!trimmed) {
    return "";
  }
  const hasJson = trimmed.toLowerCase().endsWith(".json");
  return hasJson ? trimmed : `${trimmed}.json`;
};

const createAnimation = async () => {
  const rawId = ui.newAnimationId.value;
  const animationId = ensureAnimationIdEndsWithJson(rawId);
  if (!animationId) {
    ui.status.textContent = "Enter animation id";
    return;
  }

  ui.status.textContent = "Creating animation...";
  ui.saveStatus.textContent = "";

  const spec = animationTemplateSpec();
  const res = await fetch(`/api/animations/${encodeURIComponent(animationId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(spec),
  });

  if (!res.ok) {
    ui.status.textContent = "Create failed";
    return;
  }

  await loadAnimationsList();
  ui.animationSelect.value = animationId;
  await loadAnimationSpec(animationId);
  ui.newAnimationId.value = "";
  ui.status.textContent = "Animation created";
};

const setFrameIndexMaxFromSpec = () => {
  if (appState.spec === null) {
    ui.frameIndex.max = "0";
    return;
  }
  const framesCount = appState.spec.frames.length;
  const max = Math.max(0, framesCount - 1);
  ui.frameIndex.max = String(max);
};

const addFrameEmpty = () => {
  if (appState.spec === null) {
    return;
  }
  appState.spec.frames.push({ sprites: [] });
  setFrameIndexMaxFromSpec();
  setFrameIndex(appState.spec.frames.length - 1);
};

const clonePose = (pose) => {
  const nextOffset = pose.offset ?? { x: 0, y: 0 };
  return {
    ...pose,
    offset: { x: nextOffset.x, y: nextOffset.y },
  };
};

const addFrameDuplicate = () => {
  if (appState.spec === null) {
    return;
  }
  const frame = currentFrame();
  if (frame === null) {
    return;
  }
  const nextSprites = frame.sprites.map((p) => clonePose(p));
  appState.spec.frames.push({ sprites: nextSprites });
  setFrameIndexMaxFromSpec();
  setFrameIndex(appState.spec.frames.length - 1);
};

const deleteCurrentFrame = () => {
  if (appState.spec === null) {
    return;
  }
  const framesCount = appState.spec.frames.length;
  if (framesCount <= 1) {
    ui.status.textContent = "Need at least one frame";
    return;
  }
  appState.spec.frames.splice(appState.currentFrameIndex, 1);
  setFrameIndexMaxFromSpec();
  const nextIndex = Math.min(
    appState.currentFrameIndex,
    appState.spec.frames.length - 1,
  );
  setFrameIndex(nextIndex);
};

const setFrameIndex = (nextIndex) => {
  if (appState.spec === null) {
    return;
  }
  const framesCount = appState.spec.frames.length;
  const clamped = Math.max(0, Math.min(framesCount - 1, nextIndex));
  appState.currentFrameIndex = clamped;
  appState.selectedPoseId = appState.selectedPoseId
    ? appState.spec.frames[clamped].sprites.find((p) => p.id === appState.selectedPoseId)
      ? appState.selectedPoseId
      : null
    : null;
  appState.selectedPoseIndex = -1;
  updateSelectedFromId();
  ui.frameIndex.value = String(clamped);
  syncPoseEditorToSelection();
  render();
};

const initCanvasInteractions = () => {
  const pointerState = { down: false };
  ui.scene.addEventListener("pointerdown", (event) => {
    pointerState.down = true;
    ui.scene.setPointerCapture(event.pointerId);
    const point = canvasPointForEvent(event);
    setSelectedPoseByCanvasHit(point);
    appState.isDragging = true;
    updateSelectedFromId();
    startDragForSelection(point);
    syncPoseEditorToSelection();
    render();
  });

  ui.scene.addEventListener("pointermove", (event) => {
    if (!appState.isDragging) {
      return;
    }
    const point = canvasPointForEvent(event);
    poseUpdateForDrag(point);
    syncPoseEditorToSelection();
    render();
  });

  ui.scene.addEventListener("pointerup", () => {
    pointerState.down = false;
    appState.isDragging = false;
    appState.drag.active = false;
    appState.drag.pointerOffsetX = 0;
    appState.drag.pointerOffsetY = 0;
    render();
    syncPoseEditorToSelection();
  });

  ui.scene.addEventListener("pointercancel", () => {
    pointerState.down = false;
    appState.isDragging = false;
    appState.drag.active = false;
    appState.drag.pointerOffsetX = 0;
    appState.drag.pointerOffsetY = 0;
    render();
    syncPoseEditorToSelection();
  });

  ui.scene.addEventListener("click", (event) => {
    if (pointerState.down) {
      return;
    }
    const point = canvasPointForEvent(event);
    setSelectedPoseByCanvasHit(point);
    syncPoseEditorToSelection();
    render();
  });

  ui.scene.addEventListener("dragover", (event) => {
    event.preventDefault();
    if (event.dataTransfer === null) {
      return;
    }
    event.dataTransfer.dropEffect = "copy";
  });

  ui.scene.addEventListener("drop", (event) => {
    event.preventDefault();
    if (event.dataTransfer === null) {
      return;
    }
    const spriteKey = event.dataTransfer.getData("text/plain");
    if (!spriteKey) {
      return;
    }
    const point = canvasPointForEvent(event);
    addPoseFromSpriteKey(spriteKey, point);
  });

  ui.scene.addEventListener("wheel", (event) => {
    event.preventDefault();
    const direction = event.deltaY < 0 ? 1 : -1;
    const factor = direction > 0 ? 1.2 : 0.85;
    const next = appState.zoom * factor;
    const clamped = Math.max(0.25, Math.min(8, next));
    appState.zoom = clamped;
    render();
  });
};

const stopPlayback = () => {
  appState.isPlaying = false;
  if (appState.playbackTimerId !== null) {
    window.clearInterval(appState.playbackTimerId);
    appState.playbackTimerId = null;
  }
  ui.play.disabled = false;
  ui.stop.disabled = true;
};

const startPlayback = () => {
  const spec = appState.spec;
  if (spec === null) {
    return;
  }

  stopPlayback();

  const rawSpeed = Number(spec.speed ?? 1);
  const speed = Number.isFinite(rawSpeed) && rawSpeed > 0 ? rawSpeed : 1;
  const intervalMs = Math.max(spec.frameDurationMs / speed, 1);
  const lastIndex = Math.max(spec.frames.length - 1, 0);

  appState.isPlaying = true;
  ui.play.disabled = true;
  ui.stop.disabled = false;

  appState.playbackTimerId = window.setInterval(() => {
    const nextCandidate = appState.currentFrameIndex + 1;
    const nextIndex = nextCandidate > lastIndex
      ? spec.strategy === "loop"
        ? 0
        : lastIndex
      : nextCandidate;
    setFrameIndex(nextIndex);
    if (nextCandidate > lastIndex && spec.strategy !== "loop") {
      stopPlayback();
    }
  }, intervalMs);
};

const bindUiHandlers = () => {
  ui.play.addEventListener("click", () => {
    startPlayback();
  });

  ui.stop.addEventListener("click", () => {
    stopPlayback();
  });

  ui.animationSpeed.addEventListener("change", () => {
    const spec = appState.spec;
    if (spec === null) {
      return;
    }
    const rawSpeed = Number(ui.animationSpeed.value ?? 1);
    const nextSpeed =
      Number.isFinite(rawSpeed) && rawSpeed > 0 ? rawSpeed : 1;
    spec.speed = nextSpeed;
    appState.spec = normalizeSpec(spec);
    if (appState.isPlaying) {
      startPlayback();
      return;
    }
    render();
  });

  ui.framePrev.addEventListener("click", () => {
    stopPlayback();
    setFrameIndex(appState.currentFrameIndex - 1);
  });
  ui.frameNext.addEventListener("click", () => {
    stopPlayback();
    setFrameIndex(appState.currentFrameIndex + 1);
  });

  ui.frameIndex.addEventListener("change", () => {
    stopPlayback();
    setFrameIndex(Number(ui.frameIndex.value ?? 0));
  });

  ui.frameAddEmpty.addEventListener("click", () => {
    addFrameEmpty();
  });

  ui.frameAddDuplicate.addEventListener("click", () => {
    addFrameDuplicate();
  });

  ui.frameDelete.addEventListener("click", () => {
    deleteCurrentFrame();
  });

  ui.save.addEventListener("click", () => {
    saveAnimation();
  });

  ui.animationSelect.addEventListener("change", () => {
    loadAnimationSpec(ui.animationSelect.value);
  });

  ui.newAnimationCreate.addEventListener("click", () => {
    createAnimation();
  });

  ui.poseRemove.addEventListener("click", () => {
    removeSelectedPose();
  });

  ui.poseCopy.addEventListener("click", () => {
    copySelectedPose();
  });

  ui.posePaste.addEventListener("click", () => {
    pasteCopiedPose();
  });

  ui.poseId.addEventListener("change", () => {
    const frame = currentFrame();
    if (frame === null) {
      return;
    }
    updateSelectedFromId();
    const idx = appState.selectedPoseIndex;
    if (idx < 0) {
      return;
    }
    const oldId = frame.sprites[idx].id;
    const newId = ui.poseId.value.trim();
    if (!newId) {
      ui.poseId.value = oldId;
      return;
    }
    if (newId === oldId) {
      return;
    }
    ensureIdConsistency(oldId, newId);
    appState.selectedPoseId = newId;
    updateSelectedFromId();
    syncPoseEditorToSelection();
    render();
  });

  ui.poseSpriteKey.addEventListener("change", () => {
    const frame = currentFrame();
    if (frame === null) {
      return;
    }
    updateSelectedFromId();
    const idx = appState.selectedPoseIndex;
    if (idx < 0) {
      return;
    }
    const poseId = frame.sprites[idx].id;
    const oldSpriteKey = frame.sprites[idx].spriteKey;
    const spriteKey = ui.poseSpriteKey.value;
    const oldMeta = spriteMetaForKey(oldSpriteKey);
    const editorOffset =
      oldMeta === null ? null : editorOffsetForRuntime(frame.sprites[idx].offset, oldMeta);
    frame.sprites[idx].spriteKey = spriteKey;
    if (editorOffset !== null) {
      const updatedFrame = currentFrame();
      if (updatedFrame !== null) {
        const updatedPose = updatedFrame.sprites.find((p) => p.id === poseId);
        const newMeta = spriteMetaForKey(spriteKey);
        if (updatedPose !== undefined && newMeta !== null) {
          updatedPose.offset = runtimeOffsetForEditor(editorOffset, newMeta);
        }
      }
    }
    render();
  });

  ui.poseOffsetX.addEventListener("change", () => {
    const x = Number(ui.poseOffsetX.value ?? 0);
    const frame = currentFrame();
    if (frame === null) {
      return;
    }
    updateSelectedFromId();
    const idx = appState.selectedPoseIndex;
    if (idx < 0) {
      return;
    }
    const pose = frame.sprites[idx];
    const meta = spriteMetaForKey(pose.spriteKey);
    if (meta === null) {
      return;
    }
    updatePoseField((p) => {
      const editorY = editorOffsetForRuntime(p.offset, meta).y;
      p.offset = runtimeOffsetForEditor({ x, y: editorY }, meta);
    });
    render();
  });
  ui.poseOffsetY.addEventListener("change", () => {
    const y = Number(ui.poseOffsetY.value ?? 0);
    const frame = currentFrame();
    if (frame === null) {
      return;
    }
    updateSelectedFromId();
    const idx = appState.selectedPoseIndex;
    if (idx < 0) {
      return;
    }
    const pose = frame.sprites[idx];
    const meta = spriteMetaForKey(pose.spriteKey);
    if (meta === null) {
      return;
    }
    updatePoseField((p) => {
      const editorX = editorOffsetForRuntime(p.offset, meta).x;
      p.offset = runtimeOffsetForEditor({ x: editorX, y }, meta);
    });
    render();
  });
  ui.poseRotationDeg.addEventListener("change", () => {
    const d = Number(ui.poseRotationDeg.value ?? 0);
    updatePoseField((pose) => {
      pose.rotationDeg = d;
    });
    render();
  });

  ui.poseLayer.addEventListener("change", () => {
    const layer = Number(ui.poseLayer.value ?? 0);
    updatePoseField((pose) => {
      pose.layer = layer;
    });
    render();
  });

  ui.poseVisible.addEventListener("change", () => {
    const visible = ui.poseVisible.checked;
    updatePoseField((pose) => {
      pose.visible = visible ? true : false;
    });
    render();
  });
};

const isEditableTarget = (target) => {
  if (target === null || target === undefined) {
    return false;
  }
  const node = target;
  const tagName = String(node.tagName ?? "").toUpperCase();
  if (tagName === "INPUT") {
    return true;
  }
  if (tagName === "TEXTAREA") {
    return true;
  }
  if (tagName === "SELECT") {
    return true;
  }
  if (node.isContentEditable === true) {
    return true;
  }
  return false;
};

const bindCopyPasteHandlers = () => {
  document.addEventListener("keydown", (event) => {
    if (event.defaultPrevented) {
      return;
    }
    if (isEditableTarget(event.target)) {
      return;
    }
    const key = String(event.key ?? "").toLowerCase();
    if (key === "delete") {
      event.preventDefault();
      removeSelectedPose();
      return;
    }
    if (event.ctrlKey !== true && event.metaKey !== true) {
      return;
    }
    if (key === "c") {
      event.preventDefault();
      copySelectedPose();
      return;
    }
    if (key === "v") {
      event.preventDefault();
      pasteCopiedPose();
      return;
    }
  });
};

const init = async () => {
  appState.canvas = ui.scene;
  appState.ctx = ui.scene.getContext("2d");
  if (appState.ctx !== null) {
    appState.ctx.imageSmoothingEnabled = false;
  }
  ui.status.textContent = "Loading sprites...";
  await loadSprites();
  renderSpriteList();
  ui.status.textContent = "Loading animations...";
  await loadAnimationsList();
  bindUiHandlers();
  bindCopyPasteHandlers();
  initCanvasInteractions();
  ui.status.textContent = "Loading first animation...";
  const first = appState.animations[0]?.id ?? "";
  if (first) {
    ui.animationSelect.value = first;
    await loadAnimationSpec(first);
    return;
  }
  ui.status.textContent = "No animations found";
  render();
};

void init();

