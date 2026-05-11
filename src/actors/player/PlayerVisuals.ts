import * as ex from "excalibur";
import { Resources } from "../../resource";
import { TILE_PX } from "../../world/worldConfig";
import {
  attachedVisualHiddenPosition,
  type AttachedVisualAnimation,
  type AttachedVisualHitbox,
} from "../../classes/AttachedVisualAnimation";
import {
  powerupVisualsFor,
  type HatPose,
  type PowerupAction,
  type PowerupHatVisual,
} from "../../classes/Powerups";
import type { PlayerPowerup } from "../../classes/GameProtocol";

export type PlayerVisual = "idle" | "walk" | "jump" | "crouch" | "blockBreakAction";

const hatAnchor = ex.vec(0.5, 1);
const sleepBubbleAnchor = ex.vec(0.5, 1);
const sleepBubbleOffset = ex.vec(TILE_PX / 2, -2);
const playerGraphicOffset = ex.vec(TILE_PX / 2, TILE_PX / 2);
const remoteVisualCorrectionDurationMs = 100;

export class PlayerVisuals {
  public currentVisual: PlayerVisual = "idle";
  
  private idleAnimation!: ex.Animation;
  private jumpAnimation!: ex.Animation;
  private crouchAnimation!: ex.Animation;
  private walkAnimation!: ex.Animation;
  private blockBreakAnimation!: AttachedVisualAnimation;
  private readonly bodyAnimationFrameIndexes: Partial<Record<PlayerVisual, number>> = {};
  
  private activeHat?: PowerupHatVisual;
  
  public readonly hatActor: ex.Actor;
  public readonly sleepBubbleActor: ex.Actor;
  private readonly powerupAttachmentActors: ex.Actor[] = [];
  private isInitialized = false;
  
  private visualCorrectionOffset: ex.Vector = ex.vec(0, 0);
  private visualCorrectionStartOffset: ex.Vector = ex.vec(0, 0);
  private visualCorrectionElapsedMs: number = remoteVisualCorrectionDurationMs;
  private renderOffset: ex.Vector = ex.vec(0, 0);
  private syncRenderInterpolationBeforeDraw = () => {};
  
  constructor(
    private readonly actor: ex.Actor,
    private readonly blockBreakHeldIndefinitely: () => boolean,
  ) {
    this.hatActor = new ex.Actor({
      pos: attachedVisualHiddenPosition(),
      anchor: hatAnchor,
      width: TILE_PX,
      height: TILE_PX,
      z: 12,
    });
    this.hatActor.graphics.anchor = hatAnchor;
    this.hatActor.graphics.onPreDraw = () => this.syncRenderInterpolationBeforeDraw();
    this.hideHat();

    this.sleepBubbleActor = new ex.Actor({
      pos: sleepBubbleOffset,
      anchor: sleepBubbleAnchor,
      width: TILE_PX,
      height: TILE_PX,
      z: 11,
    });
    this.sleepBubbleActor.graphics.anchor = sleepBubbleAnchor;
    this.sleepBubbleActor.graphics.use(Resources.ThoughtBubbleSleep.toSprite());
    this.sleepBubbleActor.graphics.onPreDraw = () => this.syncRenderInterpolationBeforeDraw();
    this.sleepBubbleActor.graphics.visible = false;
    this.sleepBubbleActor.graphics.opacity = 0;
    
    this.actor.graphics.anchor = ex.vec(0.5, 0.5);
    this.actor.graphics.offset = playerGraphicOffset;
  }

  public initialize() {
    this.isInitialized = true;
    this.actor.addChild(this.hatActor);
    this.actor.addChild(this.sleepBubbleActor);
    this.applyPowerup("none", false);
    this.setVisual("idle", true);
  }

  public setRenderInterpolationBeforeDraw(callback: () => void) {
    this.syncRenderInterpolationBeforeDraw = callback;
  }

  public setPaused(isPaused: boolean) {
    this.sleepBubbleActor.graphics.visible = isPaused;
    this.sleepBubbleActor.graphics.opacity = isPaused ? 1 : 0;
  }

  public applyPowerup(powerup: PlayerPowerup, isBreakingBlock: boolean) {
    this.hidePowerupAttachmentActors();
    const visuals = powerupVisualsFor(
      powerup,
      (layer) => this.createPowerupAttachmentActor(layer),
      TILE_PX,
      () => this.syncHat(),
      () => this.blockBreakHeldIndefinitely(),
    );
    const isWalking = this.currentVisual === "walk";

    if (isWalking && this.walkAnimation) {
      this.walkAnimation.pause();
    }
    if (isBreakingBlock && this.blockBreakAnimation) {
      this.blockBreakAnimation.pause();
      this.blockBreakAnimation.hideAttachment();
    }
    this.idleAnimation = visuals.idleAnimation;
    this.jumpAnimation = visuals.jumpAnimation;
    this.crouchAnimation = visuals.crouchAnimation;
    this.walkAnimation = visuals.walkAnimation;
    this.watchBodyAnimationFrames("idle", this.idleAnimation);
    this.watchBodyAnimationFrames("jump", this.jumpAnimation);
    this.watchBodyAnimationFrames("crouch", this.crouchAnimation);
    this.watchBodyAnimationFrames("walk", this.walkAnimation);
    this.blockBreakAnimation = visuals.actions.blockBreak;
    this.activeHat = visuals.hat;
    
    this.applyHatVisual();
    
    this.setVisual(this.currentVisual, true);
    this.blockBreakAnimation.update(0, this.actor.graphics.flipHorizontal);
    this.syncHat();
  }
  
  public get blockBreakDurationMs() {
    return this.blockBreakAnimation?.durationMs ?? 0;
  }

  public remainingBlockBreakCycleMs() {
    const anim = this.blockBreakAnimation;
    if (!anim) {
      return 0;
    }
    const framesLeft = Math.max(
      anim.totalFrames - anim.currentFrameIndex,
      1,
    );
    return framesLeft * anim.msPerFrame;
  }
  
  public get blockBreakAnimationRef() {
    return this.blockBreakAnimation;
  }

  public get blockBreakBaseDamage() {
    return this.blockBreakAnimation?.baseDamage ?? 0;
  }

  public get blockBreakHitboxes(): readonly AttachedVisualHitbox[] {
    return this.blockBreakAnimation?.currentHitboxes ?? [];
  }

  public get blockBreakFrameIndex() {
    return this.blockBreakAnimation?.currentFrameIndex ?? 0;
  }

  public get blockBreakCycleIndex() {
    return this.blockBreakAnimation?.cycleIndex ?? 0;
  }

  public bodyGraphicsDrawOffset() {
    return playerGraphicOffset
      .add(this.visualCorrectionOffset)
      .add(this.renderOffset);
  }

  public blockBreakFramePixelSize() {
    return (
      this.blockBreakAnimation?.currentFrameGraphicSize() ?? {
        width: TILE_PX,
        height: TILE_PX,
      }
    );
  }

  public setVisual(visual: PlayerVisual, force: boolean = false) {
    if (this.currentVisual === visual && !force) {
      return;
    }
    if (this.currentVisual !== "blockBreakAction") {
      this.bodyAnimationFor(this.currentVisual)?.pause();
    }
    if (this.currentVisual === "blockBreakAction" && visual !== "blockBreakAction") {
      this.blockBreakAnimation?.pause();
      this.blockBreakAnimation?.hideAttachment();
    }
    
    this.currentVisual = visual;
    const bodyAnimation = this.bodyAnimationFor(visual);
    if (bodyAnimation) {
      this.bodyAnimationFrameIndexes[visual] = 0;
      bodyAnimation.reset();
      this.actor.graphics.use(bodyAnimation);
      bodyAnimation.play();
      this.syncHat();
      return;
    }
    if (visual === "blockBreakAction") {
      this.blockBreakAnimation.reset();
      this.actor.graphics.use(this.blockBreakAnimation.graphic);
      this.blockBreakAnimation.play();
    }
    
    this.syncHat();
  }

  public updateBlockBreakAction(delta: number, facingLeft: boolean) {
    if (!this.blockBreakAnimation) return;
    this.blockBreakAnimation.update(delta, facingLeft);
    this.syncHat();
  }
  
  public hideBlockBreakAttachment() {
    if (!this.blockBreakAnimation) return;
    this.blockBreakAnimation.hideAttachment();
    this.syncHat();
  }
  
  public resumeBlockBreakGraphicPlayback() {
    this.blockBreakAnimation?.resumeGraphicPlaybackIfPaused();
  }

  public updateFacing(facingLeft: boolean) {
    this.actor.graphics.flipHorizontal = facingLeft;
    this.syncHat();
  }
  
  private applyHatVisual() {
    const hat = this.activeHat;
    if (!hat) {
      this.hideHat();
      return;
    }
    this.hatActor.graphics.use(hat.sprite);
    this.hatActor.graphics.anchor = hatAnchor;
  }

  private hideHat() {
    this.hatActor.pos = attachedVisualHiddenPosition();
    this.hatActor.graphics.visible = false;
    this.hatActor.graphics.opacity = 0;
  }

  private hidePowerupAttachmentActors() {
    this.powerupAttachmentActors.forEach((actor) => {
      actor.pos = attachedVisualHiddenPosition();
      actor.graphics.visible = false;
      actor.graphics.opacity = 0;
    });
  }

  private createPowerupAttachmentActor(layer: number) {
    const actor = new ex.Actor({
      pos: attachedVisualHiddenPosition(),
      anchor: ex.vec(0, 0),
      width: TILE_PX,
      height: TILE_PX,
      z: layer,
    });
    this.powerupAttachmentActors.push(actor);
    actor.graphics.onPreDraw = () => this.syncRenderInterpolationBeforeDraw();
    if (this.isInitialized) {
      this.actor.addChild(actor);
    }
    return actor;
  }

  private bodyAnimationFor(visual: PlayerVisual) {
    if (visual === "idle") {
      return this.idleAnimation;
    }
    if (visual === "walk") {
      return this.walkAnimation;
    }
    if (visual === "jump") {
      return this.jumpAnimation;
    }
    if (visual === "crouch") {
      return this.crouchAnimation;
    }
    return undefined;
  }

  private watchBodyAnimationFrames(visual: PlayerVisual, animation: ex.Animation) {
    animation.events.on("frame", (frame) => {
      this.bodyAnimationFrameIndexes[visual] = frame.frameIndex;
      this.syncHat();
    });
  }

  public syncHat() {
    const hat = this.activeHat;
    const pose = this.currentHatPose();
    const facingLeft = this.actor.graphics.flipHorizontal;
    if (!hat || !pose || pose.visible === false) {
      this.hideHat();
      return;
    }
    const offsetX = facingLeft ? -pose.offset.x : pose.offset.x;
    this.hatActor.pos = ex.vec(TILE_PX / 2 + offsetX, pose.offset.y);
    this.hatActor.graphics.anchor = hatAnchor;
    this.hatActor.graphics.flipHorizontal = facingLeft;
    this.hatActor.graphics.visible = true;
    this.hatActor.graphics.opacity = 1;
  }

  private currentHatPose() {
    const poses = this.activeHat?.poses;
    if (!poses) {
      return undefined;
    }
    if (this.currentVisual === "idle") {
      return this.hatPoseAt(
        poses.idle,
        this.bodyAnimationFrameIndexes.idle ?? 0,
      );
    }
    if (this.currentVisual === "jump") {
      return this.hatPoseAt(
        poses.jump,
        this.bodyAnimationFrameIndexes.jump ?? 0,
      );
    }
    if (this.currentVisual === "crouch") {
      return this.hatPoseAt(
        poses.crouch,
        this.bodyAnimationFrameIndexes.crouch ?? 0,
      );
    }
    if (this.currentVisual === "walk") {
      return this.hatPoseAt(
        poses.walk,
        this.bodyAnimationFrameIndexes.walk ?? 0,
      );
    }
    return this.hatActionPoseAt(
      "blockBreak",
      this.blockBreakAnimation?.currentFrameIndex ?? 0,
    );
  }

  private hatActionPoseAt(action: PowerupAction, frameIndex: number) {
    return this.hatPoseAt(this.activeHat?.poses.actions?.[action], frameIndex);
  }

  private hatPoseAt(poses: readonly HatPose[] | undefined, frameIndex: number) {
    return poses?.[frameIndex] ?? poses?.[0];
  }
  
  public applyRemotePositionCorrection(position: ex.Vector, snapDistance: number) {
    const visualWorldPosition = this.visualWorldPosition();
    this.actor.pos = ex.vec(position.x, position.y);
    const nextOffset = visualWorldPosition.sub(this.actor.pos);
    if (nextOffset.distance(ex.vec(0, 0)) >= snapDistance) {
      this.applyVisualCorrectionOffset(ex.vec(0, 0));
      return;
    }
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
    this.powerupAttachmentActors.forEach((actor) => {
      actor.graphics.offset = offset;
    });
    this.hatActor.graphics.offset = offset;
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
    const remainingRatio =
      1 - elapsedMs / remoteVisualCorrectionDurationMs;
    this.visualCorrectionElapsedMs = elapsedMs;
    this.applyVisualCorrectionOffset(
      this.visualCorrectionStartOffset.scale(remainingRatio),
    );
  }
}
