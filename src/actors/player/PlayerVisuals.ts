import * as ex from "excalibur";
import { Resources } from "../../resource";
import { TILE_PX } from "../../world/worldConfig";
import { JsonSpriteAnimation } from "../../animations/jsonSpriteAnimation/JsonSpriteAnimation";
import type { JsonSpriteAnimationSpec } from "../../animations/jsonSpriteAnimation/types";
import idleJson from "../../data/animations/player/player_idle.json";
import walkJson from "../../data/animations/player/player_walk.json";
import jumpJson from "../../data/animations/player/player_jump.json";
import crouchJson from "../../data/animations/player/player_crouch.json";
import swordJson from "../../data/animations/player_sword.json";

export type PlayerVisual = "idle" | "walk" | "jump" | "crouch" | "sword";
export type PlayerLocomotionVisual = Exclude<PlayerVisual, "sword">;

const sleepBubbleAnchor = ex.vec(0.5, 1);
const sleepBubbleOffset = ex.vec(TILE_PX / 2, -2);
export const playerGraphicOffset = ex.vec(TILE_PX / 2, TILE_PX / 2);
const remoteVisualCorrectionDurationMs = 100;
const swordFacingLockRatio = 0.15;

export class PlayerVisuals {
  public currentVisual: PlayerVisual = "idle";

  private readonly idleAnimation: JsonSpriteAnimation;
  private readonly jumpAnimation: JsonSpriteAnimation;
  private readonly crouchAnimation: JsonSpriteAnimation;
  private readonly walkAnimation: JsonSpriteAnimation;
  private readonly swordAnimation: JsonSpriteAnimation;
  private activeAnimation: JsonSpriteAnimation;

  private locomotionVisual: PlayerLocomotionVisual = "idle";
  private swordAttackActive = false;
  private facingLeft = false;
  private equippedWeaponSprite: ex.ImageSource = Resources.WoodSword;

  public readonly sleepBubbleActor: ex.Actor;

  private visualCorrectionOffset: ex.Vector = ex.vec(0, 0);
  private visualCorrectionStartOffset: ex.Vector = ex.vec(0, 0);
  private visualCorrectionElapsedMs: number = remoteVisualCorrectionDurationMs;
  private renderOffset: ex.Vector = ex.vec(0, 0);

  constructor(private readonly actor: ex.Actor) {
    const spritesByKey = Resources as Record<string, ex.ImageSource>;
    const idleSpec = idleJson as unknown as JsonSpriteAnimationSpec;
    const walkSpec = walkJson as unknown as JsonSpriteAnimationSpec;
    const jumpSpec = jumpJson as unknown as JsonSpriteAnimationSpec;
    const crouchSpec = crouchJson as unknown as JsonSpriteAnimationSpec;
    const swordSpec = swordJson as unknown as JsonSpriteAnimationSpec;

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

    this.idleAnimation = new JsonSpriteAnimation({
      host: this.actor,
      spec: idleSpec,
      spritesByKey,
      hostSpriteId: "body",
    });
    this.jumpAnimation = new JsonSpriteAnimation({
      host: this.actor,
      spec: jumpSpec,
      spritesByKey,
      hostSpriteId: "body",
    });
    this.crouchAnimation = new JsonSpriteAnimation({
      host: this.actor,
      spec: crouchSpec,
      spritesByKey,
      hostSpriteId: "body",
    });
    this.walkAnimation = new JsonSpriteAnimation({
      host: this.actor,
      spec: walkSpec,
      spritesByKey,
      hostSpriteId: "body",
    });
    this.swordAnimation = new JsonSpriteAnimation({
      host: this.actor,
      spec: swordSpec,
      spritesByKey,
      hostSpriteId: "body",
      loop: false,
    });
    this.activeAnimation = this.idleAnimation;
  }

  public initialize() {
    this.actor.addChild(this.sleepBubbleActor);
    this.applyVisual("idle", true);
  }

  public setPaused(isPaused: boolean) {
    this.sleepBubbleActor.graphics.visible = isPaused;
    this.sleepBubbleActor.graphics.opacity = isPaused ? 1 : 0;
    if (isPaused) {
      this.swordAttackActive = false;
      this.applyVisual("idle", true);
    }
    if (!isPaused) {
      this.applyVisual(this.locomotionVisual, true);
    }
    this.activeAnimation.update(
      0,
      this.facingLeft,
      this.animationBaseOffset(),
    );
  }

  public bodyGraphicCenter() {
    return playerGraphicOffset.add(this.activeAnimation.hostPoseOffset());
  }

  private animationBaseOffset() {
    return playerGraphicOffset
      .add(this.visualCorrectionOffset)
      .add(this.renderOffset);
  }

  public setLocomotionVisual(visual: PlayerLocomotionVisual, force: boolean = false) {
    this.locomotionVisual = visual;
    if (this.swordAttackActive) {
      return;
    }
    this.applyVisual(visual, force);
  }

  public playSwordAttack() {
    if (this.swordAttackActive) {
      return false;
    }
    this.swordAttackActive = true;
    this.applyVisual("sword", true);
    return true;
  }

  public isSwordAttackActive() {
    return this.swordAttackActive;
  }

  public isSwordFacingLocked() {
    if (!this.swordAttackActive) {
      return false;
    }
    return this.swordAnimation.elapsedRatio() >= swordFacingLockRatio;
  }

  private applyVisual(visual: PlayerVisual, force: boolean = false) {
    if (this.currentVisual === visual && !force) {
      return;
    }
    this.activeAnimation.hideAll();

    this.currentVisual = visual;
    const nextAnimation = this.animationFor(visual);
    this.activeAnimation = nextAnimation;
    this.activeAnimation.reset();
    this.activeAnimation.play();
    this.activeAnimation.update(
      0,
      this.facingLeft,
      this.animationBaseOffset(),
    );
    if (visual !== "sword") {
      this.activeAnimation.setPartSprite("weapon", this.equippedWeaponSprite);
    }
  }

  public updateFacing(facingLeft: boolean) {
    if (this.isSwordFacingLocked()) {
      facingLeft = this.facingLeft;
    }
    this.facingLeft = facingLeft;
    this.activeAnimation.update(
      0,
      facingLeft,
      this.animationBaseOffset(),
    );
  }

  private animationFor(visual: PlayerVisual) {
    if (visual === "walk") {
      return this.walkAnimation;
    }
    if (visual === "jump") {
      return this.jumpAnimation;
    }
    if (visual === "crouch") {
      return this.crouchAnimation;
    }
    if (visual === "sword") {
      return this.swordAnimation;
    }
    return this.idleAnimation;
  }

  public applyRemotePositionCorrection(
    position: ex.Vector,
    snapDistance: number,
  ) {
    const visualWorldPosition = this.visualWorldPosition();
    this.actor.pos = ex.vec(position.x, position.y);
    const nextOffset = visualWorldPosition.sub(this.actor.pos);
    void snapDistance;
    this.visualCorrectionStartOffset = nextOffset;
    this.visualCorrectionElapsedMs = 0;
    this.applyVisualCorrectionOffset(nextOffset);
  }

  public visualWorldPosition() {
    return this.actor.pos
      .add(this.bodyGraphicCenter())
      .add(this.visualCorrectionOffset)
      .add(this.renderOffset);
  }

  public applyRenderOffset(offset: ex.Vector) {
    this.renderOffset = offset;
    this.syncOffsets();
  }

  private syncOffsets() {
    const bubbleOffset = this.visualCorrectionOffset.add(this.renderOffset);
    this.sleepBubbleActor.graphics.offset = bubbleOffset;
    this.activeAnimation.update(0, this.facingLeft, this.animationBaseOffset());
  }

  private applyVisualCorrectionOffset(offset: ex.Vector) {
    this.visualCorrectionOffset = offset;
    this.syncOffsets();
  }

  public updateVisualCorrection(delta: number) {
    if (this.visualCorrectionElapsedMs < remoteVisualCorrectionDurationMs) {
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
    this.activeAnimation.update(
      delta,
      this.facingLeft,
      this.animationBaseOffset(),
    );
    if (this.swordAttackActive && this.swordAnimation.isFinished()) {
      this.swordAttackActive = false;
      this.applyVisual(this.locomotionVisual, true);
    }
  }

  public setEquippedWeaponSprite(sprite: ex.ImageSource): void {
    this.equippedWeaponSprite = sprite;
    if (this.currentVisual === "sword") {
      return;
    }
    this.activeAnimation.setPartSprite("weapon", sprite);
  }
}
