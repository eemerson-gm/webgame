import {
  DEFAULT_ANCHOR_PRESET,
  isAnchorPreset,
} from "../animations/jsonSpriteAnimation/anchorEditor.js";
import { centerForPose, origin, pointInPoseBounds } from "./coordinates.js";
import {
  currentFrame,
  spriteMetaForKey,
  updateSelectedFromId,
} from "./state.js";
import {
  firstAvailablePosePartId,
  isPosePartId,
  POSE_PART_IDS,
  poseIdsInFrame,
  spriteUrlToKey,
} from "./spec.js";

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
    const takenByOthers = new Set(
      frame.sprites
        .filter((_, spriteIndex) => spriteIndex !== idx)
        .map((sprite) => sprite.id),
    );
    ui.poseId.innerHTML = "";
    if (!isPosePartId(pose.id)) {
      const legacyOption = document.createElement("option");
      legacyOption.value = pose.id;
      legacyOption.textContent = `${pose.id} (legacy)`;
      legacyOption.selected = true;
      ui.poseId.appendChild(legacyOption);
    }
    POSE_PART_IDS.forEach((partId) => {
      const option = document.createElement("option");
      option.value = partId;
      option.textContent = partId;
      if (partId === pose.id) {
        option.selected = true;
      }
      if (takenByOthers.has(partId)) {
        option.disabled = true;
      }
      ui.poseId.appendChild(option);
    });
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
    ui.poseOffsetX.value = String(pose.offset.x);
    ui.poseOffsetY.value = String(pose.offset.y);
    const poseAnchor = isAnchorPreset(pose.anchor) ? pose.anchor : DEFAULT_ANCHOR_PRESET;
    ui.poseAnchorRadios.forEach((radio) => {
      radio.checked = radio.value === poseAnchor;
    });
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
        const isHit = pointInPoseBounds(point, pose, meta, o, state.zoom);
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
    const pointerRelX = (point.x - o.x) / state.zoom;
    const pointerRelY = (point.y - o.y) / state.zoom;
    const nextCenterX = pointerRelX + state.drag.pointerOffsetX;
    const nextCenterY = pointerRelY + state.drag.pointerOffsetY;
    pose.offset = {
      x: Math.round(nextCenterX),
      y: Math.round(nextCenterY),
    };
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
    const centered = centerForPose(pose);
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
    const nextAnchor = isAnchorPreset(pose.anchor) ? pose.anchor : DEFAULT_ANCHOR_PRESET;
    return {
      id: pose.id,
      spriteKey: pose.spriteKey,
      offset: { x: nextOffset.x, y: nextOffset.y },
      anchor: nextAnchor,
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
    const taken = poseIdsInFrame(frame);
    const copiedPartId = isPosePartId(copied.id) ? copied.id : null;
    const nextId =
      copiedPartId !== null && !taken.has(copiedPartId)
        ? copiedPartId
        : firstAvailablePosePartId(frame);
    if (nextId === null) {
      ui.status.textContent = "Frame already has body, weapon, and hat";
      return;
    }
    const pose = {
      id: nextId,
      spriteKey: copied.spriteKey,
      offset: { x: copied.offset.x, y: copied.offset.y },
      anchor: isAnchorPreset(copied.anchor) ? copied.anchor : DEFAULT_ANCHOR_PRESET,
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
    const nextId = firstAvailablePosePartId(frame);
    if (nextId === null) {
      ui.status.textContent = "Frame already has body, weapon, and hat";
      return;
    }
    const pose = {
      id: nextId,
      spriteKey,
      offset: { x: editorX, y: editorY },
      anchor: DEFAULT_ANCHOR_PRESET,
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
      const newId = ui.poseId.value;
      if (!isPosePartId(newId)) {
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
      frame.sprites[idx].spriteKey = ui.poseSpriteKey.value;
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
      updatePoseField((p) => {
        p.offset = { x, y: p.offset.y };
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
      updatePoseField((p) => {
        p.offset = { x: p.offset.x, y };
      });
      render();
    });
    ui.poseAnchorRadios.forEach((radio) => {
      radio.addEventListener("change", () => {
        if (radio.checked !== true) {
          return;
        }
        if (!isAnchorPreset(radio.value)) {
          return;
        }
        updatePoseField((pose) => {
          pose.anchor = radio.value;
        });
        render();
      });
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
