const el = (id) => {
  const node = document.getElementById(id);
  if (node === null) {
    throw new Error(`Missing element: ${id}`);
  }
  return node;
};

export const createUi = () => ({
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
  onionSkinPrev: el("onion-skin-prev"),
  onionSkinOpacity: el("onion-skin-opacity"),
  renderHelp: el("render-help"),
});
