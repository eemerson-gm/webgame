export const isEditableTarget = (target) => {
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

export const bindHotkeys = ({
  state,
  copySelectedPose,
  pasteCopiedPose,
  removeSelectedPose,
  saveAnimation,
  setFrameIndex,
  togglePlayback,
  undoEditorAction,
}) => {
  window.addEventListener("keydown", (event) => {
    if (event.defaultPrevented) {
      return;
    }
    if (isEditableTarget(event.target)) {
      return;
    }
    const key = String(event.key ?? "").toLowerCase();
    const usesModifier = event.ctrlKey === true || event.metaKey === true;
    if (usesModifier && key === "s") {
      event.preventDefault();
      saveAnimation();
      return;
    }
    if (usesModifier && key === "z") {
      event.preventDefault();
      undoEditorAction();
      return;
    }
    if (usesModifier && key === "c") {
      event.preventDefault();
      copySelectedPose();
      return;
    }
    if (usesModifier && key === "v") {
      event.preventDefault();
      pasteCopiedPose();
      return;
    }
    if (usesModifier) {
      return;
    }
    if (key === "delete" || key === "backspace") {
      event.preventDefault();
      removeSelectedPose();
      return;
    }
    if (key === "arrowleft") {
      event.preventDefault();
      setFrameIndex(state.currentFrameIndex - 1);
      return;
    }
    if (key === "arrowright") {
      event.preventDefault();
      setFrameIndex(state.currentFrameIndex + 1);
      return;
    }
    if (key === " ") {
      event.preventDefault();
      togglePlayback();
    }
  });
};
