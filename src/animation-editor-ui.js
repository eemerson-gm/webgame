import { createApiActions } from "./animationEditor/api.js";
import { createUi } from "./animationEditor/dom.js";
import { createDrawingActions } from "./animationEditor/drawing.js";
import { createFrameActions } from "./animationEditor/frames.js";
import { bindHotkeys } from "./animationEditor/hotkeys.js";
import { initCanvasInteractions } from "./animationEditor/interactions.js";
import { createPlaybackActions } from "./animationEditor/playback.js";
import { createPoseActions } from "./animationEditor/poses.js";
import { createRenderer } from "./animationEditor/renderer.js";
import { createAppState } from "./animationEditor/state.js";
import { normalizeSpec } from "./animationEditor/spec.js";

const ui = createUi();
const state = createAppState();
const renderer = createRenderer({ state, ui });
const render = renderer.render;

const poseActions = createPoseActions({ state, ui, render });
const drawingActions = createDrawingActions({
  state,
  ui,
  render,
  syncPoseEditorToSelection: poseActions.syncPoseEditorToSelection,
});
const frameActions = createFrameActions({
  state,
  ui,
  render,
  stopPlayback: () => playbackActions.stopPlayback(),
  syncPoseEditorToSelection: poseActions.syncPoseEditorToSelection,
});
const playbackActions = createPlaybackActions({
  state,
  ui,
  setFrameIndex: frameActions.setFrameIndex,
});
const apiActions = createApiActions({
  state,
  ui,
  render,
  setFrameIndexMaxFromSpec: frameActions.setFrameIndexMaxFromSpec,
  syncPoseEditorToSelection: poseActions.syncPoseEditorToSelection,
});

const bindAnimationSpeedHandler = () => {
  ui.animationSpeed.addEventListener("change", () => {
    const spec = state.spec;
    if (spec === null) {
      return;
    }
    const rawSpeed = Number(ui.animationSpeed.value ?? 1);
    const nextSpeed = Number.isFinite(rawSpeed) && rawSpeed > 0 ? rawSpeed : 1;
    spec.speed = nextSpeed;
    state.spec = normalizeSpec(spec);
    if (state.isPlaying) {
      playbackActions.startPlayback();
      return;
    }
    render();
  });
};

const undoEditorAction = () => {
  const drewUndo = drawingActions.undoOverlayDraw();
  if (drewUndo === true) {
    return;
  }
  poseActions.undoPoseMove();
};

const bindHandlers = () => {
  drawingActions.bindDrawingHandlers();
  playbackActions.bindPlaybackHandlers();
  frameActions.bindFrameHandlers();
  apiActions.bindAnimationHandlers();
  poseActions.bindPoseEditor();
  bindAnimationSpeedHandler();
  bindHotkeys({
    state,
    ui,
    copySelectedPose: poseActions.copySelectedPose,
    pasteCopiedPose: poseActions.pasteCopiedPose,
    removeSelectedPose: poseActions.removeSelectedPose,
    saveAnimation: apiActions.saveAnimation,
    setFrameIndex: frameActions.setFrameIndex,
    setModeDraw: drawingActions.setModeDraw,
    setModeErase: drawingActions.setModeErase,
    setModeEyedropper: drawingActions.setModeEyedropper,
    setModeSelect: drawingActions.setModeSelect,
    togglePlayback: playbackActions.togglePlayback,
    undoEditorAction,
  });
  initCanvasInteractions({
    state,
    ui,
    addPoseFromSpriteKey: poseActions.addPoseFromSpriteKey,
    commitPoseMoveUndo: poseActions.commitPoseMoveUndo,
    commitPixelDraw: drawingActions.commitPixelDraw,
    isDrawMode: drawingActions.isDrawMode,
    isEyedropperMode: drawingActions.isEyedropperMode,
    paintPixelAtEditorPoint: drawingActions.paintPixelAtEditorPoint,
    pickColorAtEditorPoint: drawingActions.pickColorAtEditorPoint,
    clearPixelPreview: drawingActions.clearPixelPreview,
    updatePixelPreviewAtEditorPoint: drawingActions.updatePixelPreviewAtEditorPoint,
    poseUpdateForDrag: poseActions.poseUpdateForDrag,
    render,
    setSelectedPoseByCanvasHit: poseActions.setSelectedPoseByCanvasHit,
    startDragForSelection: poseActions.startDragForSelection,
    syncPoseEditorToSelection: poseActions.syncPoseEditorToSelection,
  });
};

const init = async () => {
  state.canvas = ui.scene;
  state.ctx = ui.scene.getContext("2d");
  if (state.ctx !== null) {
    state.ctx.imageSmoothingEnabled = false;
  }
  drawingActions.setModeSelect();
  ui.status.textContent = "Loading sprites...";
  await apiActions.loadSprites();
  apiActions.renderSpriteList();
  ui.status.textContent = "Loading animations...";
  await apiActions.loadAnimationsList();
  bindHandlers();
  ui.status.textContent = "Loading first animation...";
  const first = state.animations[0]?.id ?? "";
  if (first) {
    ui.animationSelect.value = first;
    await apiActions.loadAnimationSpec(first);
    return;
  }
  ui.status.textContent = "No animations found";
  render();
};

void init();
