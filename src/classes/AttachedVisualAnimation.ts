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
  }>;
  frameDurationMs: number;
  attachments?: readonly AttachedVisualAttachment[];
  mirrorWidth: number;
  strategy?: ex.AnimationStrategy;
  onFrame?: (frameIndex: number) => void;
};

export type AttachedVisualAttachment = {
  actor: ex.Actor;
  sprite: ex.Sprite;
  poses: readonly AttachedVisualPose[];
};

const attachmentAnchor = ex.vec(0, 1);
const mirroredAttachmentAnchor = ex.vec(1, 1);

export class AttachedVisualAnimation {
  public readonly animation: ex.Animation;
  private readonly attachments: readonly AttachedVisualAttachment[];
  private readonly frameDurationMs: number;
  private readonly frameCount: number;
  private readonly mirrorWidth: number;
  private currentAnimationFrameIndex = 0;
  private lastFacingLeft = false;
  private isPlaying = false;

  constructor(options: AttachedVisualAnimationOptions) {
    this.animation = new ex.Animation({
      frames: options.frames.map(({ graphic }) => ({ graphic })),
      frameDuration: options.frameDurationMs,
      strategy: options.strategy ?? ex.AnimationStrategy.Loop,
    });
    this.attachments = options.attachments ?? [];
    this.frameDurationMs = options.frameDurationMs;
    this.frameCount = options.frames.length;
    this.mirrorWidth = options.mirrorWidth;
    this.animation.events.on("frame", (frame) => {
      this.currentAnimationFrameIndex = frame.frameIndex;
      this.syncAttachment(this.lastFacingLeft);
      options.onFrame?.(frame.frameIndex);
    });
    this.attachments.forEach((attachment) => {
      attachment.actor.graphics.use(attachment.sprite);
    });
    this.hideAttachments();
  }

  get graphic() {
    return this.animation;
  }

  get durationMs() {
    return this.frameCount * this.frameDurationMs;
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
    this.currentAnimationFrameIndex = 0;
    this.animation.reset();
  }

  update(deltaMs: number, facingLeft: boolean) {
    if (!this.isPlaying) {
      return;
    }
    this.lastFacingLeft = facingLeft;
    this.syncAttachment(facingLeft);
  }

  hideAttachments() {
    this.attachments.forEach((attachment) => {
      attachment.actor.pos = attachedVisualHiddenPosition();
      attachment.actor.graphics.visible = false;
      attachment.actor.graphics.opacity = 0;
    });
  }

  hideAttachment() {
    this.hideAttachments();
  }

  get currentFrameIndex() {
    return this.currentAnimationFrameIndex;
  }

  private frameDataFor(attachment: AttachedVisualAttachment) {
    return attachment.poses[this.currentFrameIndex] ?? attachment.poses[0];
  }

  private syncAttachment(facingLeft: boolean) {
    this.attachments.forEach((attachment) => {
      const frame = this.frameDataFor(attachment);
      if (!frame) {
        attachment.actor.pos = attachedVisualHiddenPosition();
        attachment.actor.graphics.visible = false;
        attachment.actor.graphics.opacity = 0;
        return;
      }
      attachment.actor.pos = facingLeft
        ? ex.vec(this.mirrorWidth - frame.offset.x, frame.offset.y)
        : ex.vec(frame.offset.x, frame.offset.y);
      attachment.actor.rotation = facingLeft ? -frame.rotation : frame.rotation;
      attachment.actor.graphics.anchor = facingLeft
        ? mirroredAttachmentAnchor
        : attachmentAnchor;
      attachment.actor.graphics.flipHorizontal = facingLeft;
      attachment.actor.graphics.visible = frame.visible !== false;
      attachment.actor.graphics.opacity = frame.visible === false ? 0 : 1;
    });
  }
}
