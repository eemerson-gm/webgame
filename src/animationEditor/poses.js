import {
  centerForPose,
  editorOffsetForRuntime,
  origin,
  runtimeOffsetForEditor,
} from "./coordinates.js";
import {
  currentFrame,
  existingPoseIds,
  spriteMetaForKey,
  updateSelectedFromId,
} from "./state.js";
import { spriteUrlToKey, uniqueIdFor } from "./spec.js";

export const createPoseActions = ({ state, ui, render }) => {
  const metaForKey = (spriteKey) => spriteMetaForKey(state, spriteKey);

  const setPoseEditorEnabled = (enabled) => {
    ui.poseEditor.hidden = !enabled;
    ui.poseNone.hidden = enabled;
  };

  const syncPoseEditorToSelection = () => {
    const frame = currentFrame(state);
    updateSelectedFromId(state);
    if (frame === null) {
      setPoseEditorEnabled(false);
      return;
    }
    const idx = state.selectedPoseIndex;
    if (idx < 0) {
      setPoseEditorEnabled(false);
      return;
    }
    const pose = frame.sprites[idx];
    const meta = metaForKey(pose.spriteKey);
    ui.poseId.value = pose.id;
    ui.poseSpriteKey.innerHTML = "";
    const allKeys = state.sprites.map(spriteUrlToKey);
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
    const editorOffset =
      meta === null ? pose.offset : editorOffsetForRuntime(pose.offset, meta);
    ui.poseOffsetX.value = String(editorOffset.x);
    ui.poseOffsetY.value = String(editorOffset.y);
    ui.poseRotationDeg.value = String(pose.rotationDeg ?? 0);
    ui.poseLayer.value = String(pose.layer ?? 0);
    ui.poseVisible.checked = pose.visible !== false;
    setPoseEditorEnabled(true);
  };

  const setSelectedPoseByCanvasHit = (point) => {
    const frame = currentFrame(state);
    if (frame === null) {
      return;
    }
    const o = origin(ui);
    const posesSorted = frame.sprites
      .slice()
      .sort((a, b) => (b.layer ?? 0) - (a.layer ?? 0));
    const hit = posesSorted
      .map((pose) => {
        const meta = metaForKey(pose.spriteKey);
        if (meta === null) {
          return null;
        }
        const centered = centerForPose(pose, meta);
        const dx = point.x - (o.x + centered.centerX * state.zoom);
        const dy = point.y - (o.y + centered.centerY * state.zoom);
        const r = (Math.max(meta.width, meta.height) / 2) * state.zoom;
        const dist2 = dx * dx + dy * dy;
        const isHit = dist2 <= r * r;
        return isHit ? pose : null;
      })
      .find((x) => x !== null);

    state.selectedPoseId = hit ? hit.id : null;
    updateSelectedFromId(state);
  };

  const poseUpdateForDrag = (point) => {
    const frame = currentFrame(state);
    if (frame === null) {
      return;
    }
    const idx = state.selectedPoseIndex;
    if (idx < 0) {
      return;
    }
    const pose = frame.sprites[idx];
    const o = origin(ui);
    const meta = metaForKey(pose.spriteKey);
    if (meta === null) {
      return;
    }
    const pointerRelX = (point.x - o.x) / state.zoom;
    const pointerRelY = (point.y - o.y) / state.zoom;
    const nextCenterX = pointerRelX + state.drag.pointerOffsetX;
    const nextCenterY = pointerRelY + state.drag.pointerOffsetY;
    pose.offset = runtimeOffsetForEditor(
      { x: Math.round(nextCenterX), y: Math.round(nextCenterY) },
      meta,
    );
  };

  const startDragForSelection = (point) => {
    const frame = currentFrame(state);
    if (frame === null) {
      clearDragSnapshot();
      return;
    }
    const idx = state.selectedPoseIndex;
    if (idx < 0) {
      clearDragSnapshot();
      return;
    }
    const pose = frame.sprites[idx];
    const o = origin(ui);
    const meta = metaForKey(pose.spriteKey);
    if (meta === null) {
      clearDragSnapshot();
      return;
    }
    const pointerRelX = (point.x - o.x) / state.zoom;
    const pointerRelY = (point.y - o.y) / state.zoom;
    const centered = centerForPose(pose, meta);
    state.drag.pointerOffsetX = centered.centerX - pointerRelX;
    state.drag.pointerOffsetY = centered.centerY - pointerRelY;
    state.drag.poseId = pose.id;
    state.drag.frameIndex = state.currentFrameIndex;
    state.drag.startOffset = { x: pose.offset.x, y: pose.offset.y };
    state.drag.active = true;
  };

  const clearDragSnapshot = () => {
    state.drag.active = false;
    state.drag.pointerOffsetX = 0;
    state.drag.pointerOffsetY = 0;
    state.drag.poseId = null;
    state.drag.frameIndex = null;
    state.drag.startOffset = null;
  };

  const commitPoseMoveUndo = () => {
    const startOffset = state.drag.startOffset;
    const poseId = state.drag.poseId;
    const frameIndex = state.drag.frameIndex;
    if (state.drag.active !== true) {
      clearDragSnapshot();
      return;
    }
    if (startOffset === null || poseId === null || frameIndex === null) {
      clearDragSnapshot();
      return;
    }
    const frame = state.spec?.frames[frameIndex] ?? null;
    if (frame === null) {
      clearDragSnapshot();
      return;
    }
    const pose = frame.sprites.find((p) => p.id === poseId) ?? null;
    if (pose === null) {
      clearDragSnapshot();
      return;
    }
    const moved =
      pose.offset.x !== startOffset.x || pose.offset.y !== startOffset.y;
    if (moved) {
      state.poseMoveUndoStack.push({
        frameIndex,
        poseId,
        offset: { x: startOffset.x, y: startOffset.y },
      });
    }
    clearDragSnapshot();
  };

  const undoPoseMove = () => {
    const token = state.poseMoveUndoStack.pop() ?? null;
    if (token === null) {
      ui.status.textContent = "Undo: no selection move";
      return false;
    }
    const frame = state.spec?.frames[token.frameIndex] ?? null;
    if (frame === null) {
      ui.status.textContent = "Undo: move frame missing";
      return false;
    }
    const pose = frame.sprites.find((p) => p.id === token.poseId) ?? null;
    if (pose === null) {
      ui.status.textContent = "Undo: moved pose missing";
      return false;
    }
    pose.offset = { x: token.offset.x, y: token.offset.y };
    state.currentFrameIndex = token.frameIndex;
    ui.frameIndex.value = String(token.frameIndex);
    state.selectedPoseId = token.poseId;
    updateSelectedFromId(state);
    syncPoseEditorToSelection();
    render();
    ui.status.textContent = `Undo: moved ${token.poseId}`;
    return true;
  };

  const updatePoseField = (updater) => {
    const frame = currentFrame(state);
    if (frame === null) {
      return;
    }
    updateSelectedFromId(state);
    const idx = state.selectedPoseIndex;
    if (idx < 0) {
      return;
    }
    updater(frame.sprites[idx]);
  };

  const removeSelectedPose = () => {
    const frame = currentFrame(state);
    if (frame === null) {
      return;
    }
    updateSelectedFromId(state);
    const idx = state.selectedPoseIndex;
    if (idx < 0) {
      return;
    }
    const removed = frame.sprites[idx];
    frame.sprites = frame.sprites.filter((p) => p !== removed);
    state.selectedPoseId = null;
    state.selectedPoseIndex = -1;
    render();
    syncPoseEditorToSelection();
  };

  const clonePoseForCopy = (pose) => {
    const nextOffset = pose.offset ?? { x: 0, y: 0 };
    return {
      id: pose.id,
      spriteKey: pose.spriteKey,
      offset: { x: nextOffset.x, y: nextOffset.y },
      rotationDeg: pose.rotationDeg ?? 0,
      layer: pose.layer ?? 0,
      visible: pose.visible !== false,
    };
  };

  const copySelectedPose = () => {
    const frame = currentFrame(state);
    if (frame === null) {
      return;
    }
    updateSelectedFromId(state);
    const idx = state.selectedPoseIndex;
    if (idx < 0) {
      return;
    }
    const pose = frame.sprites[idx];
    state.copiedPose = clonePoseForCopy(pose);
    ui.status.textContent = "Copied pose";
  };

  const pasteCopiedPose = () => {
    const frame = currentFrame(state);
    if (frame === null) {
      return;
    }
    const copied = state.copiedPose;
    if (copied === null) {
      ui.status.textContent = "Copy a pose first";
      return;
    }
    const meta = metaForKey(copied.spriteKey);
    if (meta === null) {
      ui.status.textContent = "Unknown spriteKey";
      return;
    }
    const existing = existingPoseIds(state);
    const suffix = frame.sprites.length + 1;
    const nextId = copied.id && !existing.has(copied.id)
      ? copied.id
      : uniqueIdFor(copied.spriteKey, existing, suffix);
    const pose = {
      id: nextId,
      spriteKey: copied.spriteKey,
      offset: { x: copied.offset.x, y: copied.offset.y },
      rotationDeg: copied.rotationDeg ?? 0,
      layer: copied.layer ?? 0,
      visible: copied.visible !== false,
    };
    frame.sprites.push(pose);
    state.selectedPoseId = pose.id;
    updateSelectedFromId(state);
    syncPoseEditorToSelection();
    render();
    ui.status.textContent = "Pasted pose";
  };

  const ensureIdConsistency = (oldId, newId) => {
    const frame = currentFrame(state);
    if (frame === null) {
      return;
    }
    const hasConflictInFrame = frame.sprites.some(
      (p) => p.id === newId && p.id !== oldId,
    );
    if (hasConflictInFrame) {
      ui.status.textContent = "Id already exists in this frame";
      ui.poseId.value = oldId;
      return;
    }
    frame.sprites = frame.sprites.map((p) =>
      p.id === oldId ? { ...p, id: newId } : p,
    );
  };

  const addPoseFromSpriteKey = (spriteKey, point) => {
    const frame = currentFrame(state);
    if (frame === null) {
      return;
    }
    const meta = metaForKey(spriteKey);
    if (meta === null) {
      return;
    }
    const o = origin(ui);
    const editorX = Math.round((point.x - o.x) / state.zoom);
    const editorY = Math.round((point.y - o.y) / state.zoom);
    const existing = existingPoseIds(state);
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
    state.selectedPoseId = pose.id;
    updateSelectedFromId(state);
    syncPoseEditorToSelection();
    render();
  };

  const bindPoseEditor = () => {
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
      const frame = currentFrame(state);
      if (frame === null) {
        return;
      }
      updateSelectedFromId(state);
      const idx = state.selectedPoseIndex;
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
      state.selectedPoseId = newId;
      updateSelectedFromId(state);
      syncPoseEditorToSelection();
      render();
    });
    ui.poseSpriteKey.addEventListener("change", () => {
      const frame = currentFrame(state);
      if (frame === null) {
        return;
      }
      updateSelectedFromId(state);
      const idx = state.selectedPoseIndex;
      if (idx < 0) {
        return;
      }
      const poseId = frame.sprites[idx].id;
      const oldSpriteKey = frame.sprites[idx].spriteKey;
      const spriteKey = ui.poseSpriteKey.value;
      const oldMeta = metaForKey(oldSpriteKey);
      const editorOffset =
        oldMeta === null
          ? null
          : editorOffsetForRuntime(frame.sprites[idx].offset, oldMeta);
      frame.sprites[idx].spriteKey = spriteKey;
      if (editorOffset !== null) {
        const updatedPose = frame.sprites.find((p) => p.id === poseId);
        const newMeta = metaForKey(spriteKey);
        if (updatedPose !== undefined && newMeta !== null) {
          updatedPose.offset = runtimeOffsetForEditor(editorOffset, newMeta);
        }
      }
      render();
    });
    ui.poseOffsetX.addEventListener("change", () => {
      const x = Number(ui.poseOffsetX.value ?? 0);
      const frame = currentFrame(state);
      if (frame === null) {
        return;
      }
      updateSelectedFromId(state);
      const idx = state.selectedPoseIndex;
      if (idx < 0) {
        return;
      }
      const pose = frame.sprites[idx];
      const meta = metaForKey(pose.spriteKey);
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
      const frame = currentFrame(state);
      if (frame === null) {
        return;
      }
      updateSelectedFromId(state);
      const idx = state.selectedPoseIndex;
      if (idx < 0) {
        return;
      }
      const pose = frame.sprites[idx];
      const meta = metaForKey(pose.spriteKey);
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

  return {
    addPoseFromSpriteKey,
    bindPoseEditor,
    commitPoseMoveUndo,
    copySelectedPose,
    pasteCopiedPose,
    poseUpdateForDrag,
    removeSelectedPose,
    setSelectedPoseByCanvasHit,
    startDragForSelection,
    syncPoseEditorToSelection,
    undoPoseMove,
  };
};
