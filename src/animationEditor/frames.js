import { currentFrame, updateSelectedFromId } from "./state.js";

export const createFrameActions = ({
  state,
  ui,
  render,
  stopPlayback,
  syncPoseEditorToSelection,
}) => {
  const setFrameIndexMaxFromSpec = () => {
    if (state.spec === null) {
      ui.frameIndex.max = "0";
      return;
    }
    const framesCount = state.spec.frames.length;
    const max = Math.max(0, framesCount - 1);
    ui.frameIndex.max = String(max);
  };

  const setFrameIndex = (nextIndex) => {
    if (state.spec === null) {
      return;
    }
    const framesCount = state.spec.frames.length;
    const clamped = Math.max(0, Math.min(framesCount - 1, nextIndex));
    state.currentFrameIndex = clamped;
    state.selectedPoseId = state.selectedPoseId
      ? state.spec.frames[clamped].sprites.find(
          (p) => p.id === state.selectedPoseId,
        )
        ? state.selectedPoseId
        : null
      : null;
    state.selectedPoseIndex = -1;
    updateSelectedFromId(state);
    ui.frameIndex.value = String(clamped);
    syncPoseEditorToSelection();
    render();
  };

  const addFrameEmpty = () => {
    if (state.spec === null) {
      return;
    }
    state.spec.frames.push({ sprites: [] });
    setFrameIndexMaxFromSpec();
    setFrameIndex(state.spec.frames.length - 1);
  };

  const clonePose = (pose) => {
    const nextOffset = pose.offset ?? { x: 0, y: 0 };
    return {
      ...pose,
      offset: { x: nextOffset.x, y: nextOffset.y },
    };
  };

  const addFrameDuplicate = () => {
    if (state.spec === null) {
      return;
    }
    const frame = currentFrame(state);
    if (frame === null) {
      return;
    }
    const nextSprites = frame.sprites.map((p) => clonePose(p));
    state.spec.frames.push({ ...frame, sprites: nextSprites });
    setFrameIndexMaxFromSpec();
    setFrameIndex(state.spec.frames.length - 1);
  };

  const deleteCurrentFrame = () => {
    if (state.spec === null) {
      return;
    }
    const framesCount = state.spec.frames.length;
    if (framesCount <= 1) {
      ui.status.textContent = "Need at least one frame";
      return;
    }
    state.spec.frames.splice(state.currentFrameIndex, 1);
    setFrameIndexMaxFromSpec();
    const nextIndex = Math.min(
      state.currentFrameIndex,
      state.spec.frames.length - 1,
    );
    setFrameIndex(nextIndex);
  };

  const bindFrameHandlers = () => {
    ui.framePrev.addEventListener("click", () => {
      stopPlayback();
      setFrameIndex(state.currentFrameIndex - 1);
    });
    ui.frameNext.addEventListener("click", () => {
      stopPlayback();
      setFrameIndex(state.currentFrameIndex + 1);
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
  };

  return {
    addFrameDuplicate,
    addFrameEmpty,
    bindFrameHandlers,
    deleteCurrentFrame,
    setFrameIndex,
    setFrameIndexMaxFromSpec,
  };
};
