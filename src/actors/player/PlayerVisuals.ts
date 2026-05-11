import * as ex from "excalibur";
import { Resources } from "../../resource";
import { TILE_PX } from "../../world/worldConfig";

export type PlayerVisual = "idle" | "walk" | "jump" | "crouch";

const walkFrameDurationMs = 120;
const sleepBubbleAnchor = ex.vec(0.5, 1);
const sleepBubbleOffset = ex.vec(TILE_PX / 2, -2);
const playerGraphicOffset = ex.vec(TILE_PX / 2, TILE_PX / 2);
const remoteVisualCorrectionDurationMs = 100;

const centeredSpriteFor = (image: ex.ImageSource) => {
  const sprite = image.toSprite();
  sprite.origin = ex.vec(sprite.width / 2, sprite.height / 2);
  return sprite;
};

const animationFor = (frames: ex.ImageSource[]) =>
  new ex.Animation({
    frames: frames.map((image) => ({
      graphic: centeredSpriteFor(image),
    })),
    frameDuration: walkFrameDurationMs,
    strategy: ex.AnimationStrategy.Loop,
  });

export class PlayerVisuals {
  public currentVisual: PlayerVisual = "idle";

  private readonly idleAnimation = animationFor([Resources.Player]);
  private readonly jumpAnimation = animationFor([Resources.PlayerJump]);
  private readonly crouchAnimation = animationFor([Resources.PlayerCrouch]);
  private readonly walkAnimation = animationFor([
    Resources.PlayerWalk1,
    Resources.PlayerWalk2,
  ]);

  public readonly sleepBubbleActor: ex.Actor;

  private visualCorrectionOffset: ex.Vector = ex.vec(0, 0);
  private visualCorrectionStartOffset: ex.Vector = ex.vec(0, 0);
  private visualCorrectionElapsedMs: number = remoteVisualCorrectionDurationMs;
  private renderOffset: ex.Vector = ex.vec(0, 0);

  constructor(private readonly actor: ex.Actor) {
    this.sleepBubbleActor = new ex.Actor({
      pos: sleepBubbleOffset,
      anchor: sleepBubbleAnchor,
      width: TILE_PX,
      height: TILE_PX,
      z: 11,
    });
    this.sleepBubbleActor.graphics.anchor = sleepBubbleAnchor;
    this.sleepBubbleActor.graphics.use(Resources.ThoughtBubbleSleep.toSprite());
    this.sleepBubbleActor.graphics.visible = false;
    this.sleepBubbleActor.graphics.opacity = 0;

    this.actor.graphics.anchor = ex.vec(0.5, 0.5);
    this.actor.graphics.offset = playerGraphicOffset;
  }

  public initialize() {
    this.actor.addChild(this.sleepBubbleActor);
    this.setVisual("idle", true);
  }

  public setPaused(isPaused: boolean) {
    this.sleepBubbleActor.graphics.visible = isPaused;
    this.sleepBubbleActor.graphics.opacity = isPaused ? 1 : 0;
  }

  public bodyGraphicsDrawOffset() {
    return playerGraphicOffset
      .add(this.visualCorrectionOffset)
      .add(this.renderOffset);
  }

  public setVisual(visual: PlayerVisual, force: boolean = false) {
    if (this.currentVisual === visual && !force) {
      return;
    }
    this.bodyAnimationFor(this.currentVisual).pause();

    this.currentVisual = visual;
    const bodyAnimation = this.bodyAnimationFor(visual);
    bodyAnimation.reset();
    this.actor.graphics.use(bodyAnimation);
    bodyAnimation.play();
  }

  public updateFacing(facingLeft: boolean) {
    this.actor.graphics.flipHorizontal = facingLeft;
  }

  private bodyAnimationFor(visual: PlayerVisual) {
    if (visual === "walk") {
      return this.walkAnimation;
    }
    if (visual === "jump") {
      return this.jumpAnimation;
    }
    if (visual === "crouch") {
      return this.crouchAnimation;
    }
    return this.idleAnimation;
  }

  public applyRemotePositionCorrection(position: ex.Vector, snapDistance: number) {
    const visualWorldPosition = this.visualWorldPosition();
    this.actor.pos = ex.vec(position.x, position.y);
    const nextOffset = visualWorldPosition.sub(this.actor.pos);
    void snapDistance;
    this.visualCorrectionStartOffset = nextOffset;
    this.visualCorrectionElapsedMs = 0;
    this.applyVisualCorrectionOffset(nextOffset);
  }

  private visualWorldPosition() {
    return this.actor.pos.add(this.visualCorrectionOffset).add(this.renderOffset);
  }

  public applyRenderOffset(offset: ex.Vector) {
    this.renderOffset = offset;
    this.syncOffsets();
  }

  private syncOffsets() {
    const offset = this.visualCorrectionOffset.add(this.renderOffset);
    this.actor.graphics.offset = playerGraphicOffset.add(offset);
    this.sleepBubbleActor.graphics.offset = offset;
  }

  private applyVisualCorrectionOffset(offset: ex.Vector) {
    this.visualCorrectionOffset = offset;
    this.syncOffsets();
  }

  public updateVisualCorrection(delta: number) {
    if (this.visualCorrectionElapsedMs >= remoteVisualCorrectionDurationMs) {
      return;
    }
    const elapsedMs = Math.min(
      this.visualCorrectionElapsedMs + delta,
      remoteVisualCorrectionDurationMs,
    );
    const remainingRatio = 1 - elapsedMs / remoteVisualCorrectionDurationMs;
    this.visualCorrectionElapsedMs = elapsedMs;
    this.applyVisualCorrectionOffset(
      this.visualCorrectionStartOffset.scale(remainingRatio),
    );
  }
}
