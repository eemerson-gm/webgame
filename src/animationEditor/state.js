export const createAppState = () => ({
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
  drag: {
    active: false,
    pointerOffsetX: 0,
    pointerOffsetY: 0,
    poseId: null,
    frameIndex: null,
    startOffset: null,
  },
  zoom: 2,
  pixelCanvasByDataUrl: {},
  poseMoveUndoStack: [],
});

export const currentFrame = (state) => {
  const spec = state.spec;
  if (spec === null) {
    return null;
  }
  return spec.frames[state.currentFrameIndex] ?? null;
};

export const updateSelectedFromId = (state) => {
  const frame = currentFrame(state);
  if (frame === null) {
    state.selectedPoseId = null;
    state.selectedPoseIndex = -1;
    return;
  }
  const idx = state.selectedPoseId
    ? frame.sprites.findIndex((p) => p.id === state.selectedPoseId)
    : -1;
  state.selectedPoseIndex = idx;
  if (idx < 0) {
    state.selectedPoseId = null;
  }
};

export const spriteMetaForKey = (state, spriteKey) =>
  state.spritesByKey[spriteKey] ?? null;
