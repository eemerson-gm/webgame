import * as ex from "excalibur";
import { Resources, spriteResourcesByKey } from "@/resource";
import { TILE_PX } from "@/world/worldConfig";
import { JsonSpriteAnimation } from "@/animations/jsonSpriteAnimation/JsonSpriteAnimation";
import type { JsonSpriteAnimationSpec } from "@/animations/jsonSpriteAnimation/types";
import { JsonLocomotionVisuals } from "@/actors/walking/JsonLocomotionVisuals";
import type { LocomotionVisual } from "@/actors/walking/LocomotionVisuals";
import idleJson from "@/data/animations/player/player_idle.json";
import walkJson from "@/data/animations/player/player_walk.json";
import jumpJson from "@/data/animations/player/player_jump.json";
import crouchJson from "@/data/animations/player/player_crouch.json";
import swordJson from "@/data/animations/player_sword.json";
import type { HandAttackAnimation } from "@/combat/playerHands";

export type PlayerVisual = LocomotionVisual | "crouch" | "sword";
export type PlayerLocomotionVisual = Exclude<PlayerVisual, "sword">;

const sleepBubbleAnchor = ex.vec(0.5, 1);
const sleepBubbleOffset = ex.vec(TILE_PX / 2, -2);
export const playerGraphicOffset = ex.vec(TILE_PX / 2, TILE_PX / 2);
const remoteVisualCorrectionDurationMs = 100;
const swordFacingLockRatio = 0.15;

export class PlayerVisuals {
  public currentVisual: PlayerVisual = "idle";

  private readonly locomotion: JsonLocomotionVisuals;
  private readonly crouchAnimation: JsonSpriteAnimation;
  private readonly swordAnimation: JsonSpriteAnimation;
  private activeAnimation: JsonSpriteAnimation;

  private locomotionVisual: PlayerLocomotionVisual = "idle";
  private swordAttackActive = false;
  private swordAttackCycleCount = 0;
  private facingLeft = false;
  private equippedWeaponSprite: ex.ImageSource = Resources.WoodSword;

  public readonly sleepBubbleActor: ex.Actor;

  private visualCorrectionOffset: ex.Vector = ex.vec(0, 0);
  private visualCorrectionStartOffset: ex.Vector = ex.vec(0, 0);
  private visualCorrectionElapsedMs: number = remoteVisualCorrectionDurationMs;
  private renderOffset: ex.Vector = ex.vec(0, 0);

  constructor(private readonly actor: ex.Actor) {
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

    this.locomotion = new JsonLocomotionVisuals({
      actor: this.actor,
      spritesByKey: spriteResourcesByKey,
      graphicOffset: playerGraphicOffset,
      hostSpriteId: "body",
      idleSpec: idleJson as unknown as JsonSpriteAnimationSpec,
      walkSpec: walkJson as unknown as JsonSpriteAnimationSpec,
      jumpSpec: jumpJson as unknown as JsonSpriteAnimationSpec,
    });

    this.crouchAnimation = new JsonSpriteAnimation({
      host: this.actor,
      spec: crouchSpec,
      spritesByKey: spriteResourcesByKey,
      hostSpriteId: "body",
    });
    this.swordAnimation = new JsonSpriteAnimation({
      host: this.actor,
      spec: swordSpec,
      spritesByKey: spriteResourcesByKey,
      hostSpriteId: "body",
      loop: false,
    });
    this.activeAnimation = this.locomotion.activeLocomotionAnimation();
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
    this.swordAttackCycleCount += 1;
    this.applyVisual("sword", true);
    return true;
  }

  public playPickaxeAttack() {
    return this.playSwordAttack();
  }

  public playHandAttack(handAttackAnimation: HandAttackAnimation) {
    if (handAttackAnimation === "pickaxe") {
      return this.playPickaxeAttack();
    }
    if (handAttackAnimation === "sword") {
      return this.playSwordAttack();
    }
    return false;
  }

  public isSwordAttackActive() {
    return this.swordAttackActive;
  }

  public endSwordAttackForResync() {
    if (!this.swordAttackActive) {
      return;
    }
    this.swordAttackActive = false;
    this.applyVisual(this.locomotionVisual, true);
  }

  public swordAttackCycle() {
    return this.swordAttackCycleCount;
  }

  public swordAttackElapsedRatio() {
    if (!this.swordAttackActive) {
      return 0;
    }
    return this.swordAnimation.elapsedRatio();
  }

  public swordWeaponActor() {
    return this.swordAnimation.actorForPart("weapon");
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
    this.locomotion.hideAllLocomotion();
    this.crouchAnimation.hideAll();
    this.swordAnimation.hideAll();
    this.currentVisual = visual;
    if (visual === "crouch") {
      this.activeAnimation = this.crouchAnimation;
      this.activeAnimation.reset();
      this.activeAnimation.play();
      this.activeAnimation.setPartSprite("weapon", this.equippedWeaponSprite);
      this.activeAnimation.update(
        0,
        this.facingLeft,
        this.animationBaseOffset(),
      );
      return;
    }
    if (visual === "sword") {
      this.activeAnimation = this.swordAnimation;
      this.activeAnimation.reset();
      this.activeAnimation.play();
      this.activeAnimation.update(
        0,
        this.facingLeft,
        this.animationBaseOffset(),
      );
      return;
    }
    this.locomotion.setLocomotionVisual(visual, true);
    this.activeAnimation = this.locomotion.activeLocomotionAnimation();
    this.activeAnimation.setPartSprite("weapon", this.equippedWeaponSprite);
    this.activeAnimation.update(
      0,
      this.facingLeft,
      this.animationBaseOffset(),
    );
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

  public applyRemotePositionCorrection(
    position: ex.Vector,
    snapDistance: number,
  ) {
    void snapDistance;
    this.actor.pos = ex.vec(position.x, position.y);
    this.resetVisualCorrection();
    this.activeAnimation.update(0, this.facingLeft, this.animationBaseOffset());
  }

  private resetVisualCorrection() {
    this.visualCorrectionStartOffset = ex.vec(0, 0);
    this.visualCorrectionElapsedMs = remoteVisualCorrectionDurationMs;
    this.applyVisualCorrectionOffset(ex.vec(0, 0));
  }

  public visualWorldPosition() {
    return this.actor.pos.add(this.bodyGraphicCenter());
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

  public update(delta: number) {
    this.updateVisualCorrection(delta);
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
