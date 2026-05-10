import * as ex from "excalibur";

export const attachedVisualHiddenPosition = () => ex.vec(-100000, -100000);

export type AttachedVisualPose = {
  offset: ex.Vector;
  rotation: number;
  visible?: boolean;
};

export type AttachedVisualHitbox = {
  id: string;
  offset: ex.Vector;
  width: number;
  height: number;
};

type AttachedVisualAnimationOptions = {
  frames: Array<{
    graphic: ex.Graphic;
  }>;
  frameDurationMs: number;
  attachments?: readonly AttachedVisualAttachment[];
  hitboxes?: readonly (readonly AttachedVisualHitbox[])[];
  baseDamage?: number;
  mirrorWidth: number;
  strategy?: ex.AnimationStrategy;
  shouldLoop?: () => boolean;
  onFrame?: () => void;
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
  private readonly frameGraphics: readonly ex.Graphic[];
  private readonly frameDurationMs: number;
  private readonly frameCount: number;
  private readonly mirrorWidth: number;
  private readonly hitboxes: readonly (readonly AttachedVisualHitbox[])[];
  public readonly baseDamage: number;
  private readonly shouldLoopCheck?: () => boolean;
  private currentAnimationFrameIndex = 0;
  private currentCycleIndex = 0;
  private lastFacingLeft = false;
  private isPlaying = false;

  constructor(options: AttachedVisualAnimationOptions) {
    this.frameGraphics = options.frames.map(({ graphic }) => graphic);
    const strategy =
      options.shouldLoop !== undefined
        ? ex.AnimationStrategy.Loop
        : (options.strategy ?? ex.AnimationStrategy.Freeze);
    this.shouldLoopCheck = options.shouldLoop;
    this.animation = new ex.Animation({
      frames: options.frames.map(({ graphic }) => ({ graphic })),
      frameDuration: options.frameDurationMs,
      strategy,
    });
    this.attachments = options.attachments ?? [];
    this.frameDurationMs = options.frameDurationMs;
    this.frameCount = options.frames.length;
    this.mirrorWidth = options.mirrorWidth;
    this.hitboxes = options.hitboxes ?? [];
    this.baseDamage = options.baseDamage ?? 0;
    this.animation.events.on("frame", (frame) => {
      this.applyFrameFromEngine(frame.frameIndex, options.onFrame);
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

  get msPerFrame() {
    return this.frameDurationMs;
  }

  get totalFrames() {
    return this.frameCount;
  }

  play() {
    this.isPlaying = true;
    this.animation.play();
  }

  pause() {
    this.isPlaying = false;
    this.animation.pause();
  }

  public resumeGraphicPlaybackIfPaused() {
    if (this.animation.isPlaying) {
      return;
    }
    this.animation.play();
  }

  reset() {
    this.currentAnimationFrameIndex = 0;
    this.currentCycleIndex = 0;
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

  get cycleIndex() {
    return this.currentCycleIndex;
  }

  get currentHitboxes() {
    return this.hitboxes[this.currentFrameIndex] ?? [];
  }

  public currentFrameGraphicSize() {
    const graphic = this.frameGraphics[this.currentFrameIndex];
    const width = graphic?.width ?? this.mirrorWidth;
    const height = graphic?.height ?? this.mirrorWidth;
    return { width, height };
  }

  private frameDataFor(attachment: AttachedVisualAttachment) {
    return attachment.poses[this.currentFrameIndex] ?? attachment.poses[0];
  }

  private applyFrameFromEngine(nextIndex: number, onFrame?: () => void) {
    if (
      this.shouldLoopCheck &&
      this.frameCount > 1 &&
      this.currentAnimationFrameIndex === this.frameCount - 1 &&
      nextIndex === 0 &&
      !this.shouldLoopCheck()
    ) {
      const last = this.frameCount - 1;
      this.animation.goToFrame(last);
      this.animation.pause();
      this.currentAnimationFrameIndex = last;
      this.syncAttachment(this.lastFacingLeft);
      onFrame?.();
      return;
    }
    if (this.currentAnimationFrameIndex === this.frameCount - 1 && nextIndex === 0) {
      this.currentCycleIndex += 1;
    }
    this.currentAnimationFrameIndex = nextIndex;
    this.syncAttachment(this.lastFacingLeft);
    onFrame?.();
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
