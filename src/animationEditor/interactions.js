import { canvasPointForEvent } from "./coordinates.js";
import { updateSelectedFromId } from "./state.js";

export const initCanvasInteractions = ({
  state,
  ui,
  addPoseFromSpriteKey,
  commitPoseMoveUndo,
  poseUpdateForDrag,
  render,
  setSelectedPoseByCanvasHit,
  startDragForSelection,
  syncPoseEditorToSelection,
}) => {
  const pointerState = { down: false };
  ui.scene.addEventListener("pointerdown", (event) => {
    pointerState.down = true;
    ui.scene.setPointerCapture(event.pointerId);
    const point = canvasPointForEvent(ui, event);
    setSelectedPoseByCanvasHit(point);
    state.isDragging = true;
    updateSelectedFromId(state);
    syncPoseEditorToSelection();
    render();
    startDragForSelection(point);
  });

  ui.scene.addEventListener("pointermove", (event) => {
    const point = canvasPointForEvent(ui, event);
    if (!state.isDragging) {
      return;
    }
    poseUpdateForDrag(point);
    syncPoseEditorToSelection();
    render();
  });

  const endPointer = () => {
    pointerState.down = false;
    state.isDragging = false;
    commitPoseMoveUndo();
    render();
    syncPoseEditorToSelection();
  };

  ui.scene.addEventListener("pointerup", () => {
    endPointer();
  });

  ui.scene.addEventListener("pointercancel", () => {
    endPointer();
  });

  ui.scene.addEventListener("click", (event) => {
    if (pointerState.down) {
      return;
    }
    const point = canvasPointForEvent(ui, event);
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
    const point = canvasPointForEvent(ui, event);
    addPoseFromSpriteKey(spriteKey, point);
  });

  ui.scene.addEventListener("wheel", (event) => {
    event.preventDefault();
    const direction = event.deltaY < 0 ? 1 : -1;
    const factor = direction > 0 ? 1.2 : 0.85;
    const next = state.zoom * factor;
    const clamped = Math.max(0.25, Math.min(8, next));
    state.zoom = clamped;
    render();
  });
};
