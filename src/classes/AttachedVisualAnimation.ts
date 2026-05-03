import * as ex from "excalibur";

export const attachedVisualHiddenPosition = () => ex.vec(-100000, -100000);

export type AttachedVisualPose = {
  offset: ex.Vector;
  rotation: number;
  visible?: boolean;
};

type AttachedVisualAnimationOptions = {
  frames: Array<{
    graphic: ex.Graphic;
    attachment?: AttachedVisualPose;
  }>;
  frameDurationMs: number;
  attachmentActor: ex.Actor;
  attachmentSprite?: ex.Sprite;
  mirrorWidth: number;
  strategy?: ex.AnimationStrategy;
};

const attachmentAnchor = ex.vec(0, 1);
const mirroredAttachmentAnchor = ex.vec(1, 1);

export class AttachedVisualAnimation {
  public readonly animation: ex.Animation;
  private readonly attachmentActor: ex.Actor;
  private readonly attachmentSprite?: ex.Sprite;
  private readonly frameData: Array<AttachedVisualPose | undefined>;
  private readonly frameDurationMs: number;
  private readonly mirrorWidth: number;
  private readonly strategy: ex.AnimationStrategy;
  private elapsedMs = 0;
  private isPlaying = false;

  constructor(options: AttachedVisualAnimationOptions) {
    this.animation = new ex.Animation({
      frames: options.frames.map(({ graphic }) => ({ graphic })),
      frameDuration: options.frameDurationMs,
      strategy: options.strategy ?? ex.AnimationStrategy.Loop,
    });
    this.attachmentActor = options.attachmentActor;
    this.attachmentSprite = options.attachmentSprite;
    this.frameData = options.frames.map(({ attachment }) => attachment);
    this.frameDurationMs = options.frameDurationMs;
    this.mirrorWidth = options.mirrorWidth;
    this.strategy = options.strategy ?? ex.AnimationStrategy.Loop;
    if (this.attachmentSprite) {
      this.attachmentActor.graphics.use(this.attachmentSprite);
    }
    this.hideAttachment();
  }

  get graphic() {
    return this.animation;
  }

  get durationMs() {
    return this.frameData.length * this.frameDurationMs;
  }

  play() {
    this.isPlaying = true;
    this.animation.play();
  }

  pause() {
    this.isPlaying = false;
    this.animation.pause();
  }

  reset() {
    this.elapsedMs = 0;
    this.animation.reset();
  }

  update(deltaMs: number, facingLeft: boolean) {
    if (!this.isPlaying) {
      return;
    }
    this.elapsedMs += deltaMs;
    this.syncAttachment(facingLeft);
  }

  hideAttachment() {
    this.attachmentActor.pos = attachedVisualHiddenPosition();
    this.attachmentActor.graphics.visible = false;
    this.attachmentActor.graphics.opacity = 0;
  }

  private get currentFrameIndex() {
    if (this.frameData.length === 0) {
      return 0;
    }
    const nextFrameIndex = Math.floor(this.elapsedMs / this.frameDurationMs);
    if (this.strategy === ex.AnimationStrategy.Loop) {
      return nextFrameIndex % this.frameData.length;
    }
    return Math.min(nextFrameIndex, this.frameData.length - 1);
  }

  private get currentFrameData() {
    return this.frameData[this.currentFrameIndex];
  }

  private syncAttachment(facingLeft: boolean) {
    const frame = this.currentFrameData;
    if (!this.attachmentSprite || !frame) {
      this.hideAttachment();
      return;
    }
    this.attachmentActor.pos = facingLeft
      ? ex.vec(this.mirrorWidth - frame.offset.x, frame.offset.y)
      : ex.vec(frame.offset.x, frame.offset.y);
    this.attachmentActor.rotation = facingLeft ? -frame.rotation : frame.rotation;
    this.attachmentActor.graphics.anchor = facingLeft
      ? mirroredAttachmentAnchor
      : attachmentAnchor;
    this.attachmentActor.graphics.flipHorizontal = facingLeft;
    this.attachmentActor.graphics.visible = frame.visible !== false;
    this.attachmentActor.graphics.opacity = frame.visible === false ? 0 : 1;
  }
}
