import { normalizeSpec, animationTemplateSpec, ensureAnimationIdEndsWithJson } from "./spec.js";

export const createApiActions = ({
  state,
  ui,
  render,
  setFrameIndexMaxFromSpec,
  syncPoseEditorToSelection,
}) => {
  const loadSprites = async () => {
    const res = await fetch("/api/sprites");
    const data = await res.json();
    const sprites = data.sprites ?? [];
    state.sprites = sprites.map((s) => ({ ...s }));
    const byKey = {};

    await Promise.all(
      state.sprites.map(async (s) => {
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

    state.spritesByKey = byKey;
  };

  const renderSpriteList = () => {
    ui.spriteList.innerHTML = "";
    state.sprites.forEach((sprite) => {
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

      const meta = state.spritesByKey[sprite.key] ?? null;
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
    state.animations = animations;
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
    state.spec = normalizeSpec(json);
    state.animationId = animationId;
    state.isPlaying = false;
    if (state.playbackTimerId !== null) {
      window.clearInterval(state.playbackTimerId);
      state.playbackTimerId = null;
    }
    state.currentFrameIndex = 0;
    state.selectedPoseId = null;
    state.selectedPoseIndex = -1;
    ui.frameIndex.value = "0";
    ui.animationSpeed.value = String(state.spec?.speed ?? 1);
    if (state.spec.frames.length === 0) {
      state.spec.frames = [{ sprites: [] }];
    }
    setFrameIndexMaxFromSpec();
    ui.status.textContent = `Loaded frames: ${state.spec.frames.length}`;
    syncPoseEditorToSelection();
    render();
  };

  const saveAnimation = async () => {
    const animationId = state.animationId;
    if (!animationId || state.spec === null) {
      ui.saveStatus.textContent = "No animation loaded";
      return;
    }
    ui.saveStatus.textContent = "Saving...";
    const res = await fetch(
      `/api/animations/${encodeURIComponent(animationId)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state.spec),
      },
    );
    if (!res.ok) {
      ui.saveStatus.textContent = "Save failed";
      return;
    }
    ui.saveStatus.textContent = "Saved";
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

    const spec = animationTemplateSpec(state);
    const res = await fetch(
      `/api/animations/${encodeURIComponent(animationId)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(spec),
      },
    );

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

  const bindAnimationHandlers = () => {
    ui.save.addEventListener("click", () => {
      saveAnimation();
    });
    ui.animationSelect.addEventListener("change", () => {
      loadAnimationSpec(ui.animationSelect.value);
    });
    ui.newAnimationCreate.addEventListener("click", () => {
      createAnimation();
    });
  };

  return {
    bindAnimationHandlers,
    createAnimation,
    loadAnimationSpec,
    loadAnimationsList,
    loadSprites,
    renderSpriteList,
    saveAnimation,
  };
};
