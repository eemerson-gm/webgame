import * as ex from "excalibur";
import { TILE_PX } from "../world/worldConfig";
import { PlayerInputState } from "./PlayerInputState";
import type { TileCollisionWorld } from "./MovingActor";
import {
  type LivingSeparationKind,
  type LivingVitality,
} from "./LivingActor";
import {
  WalkingActor,
  collisionOffsetForGraphicCenter,
  type WalkingTuning,
} from "./WalkingActor";
import type { LocomotionVisualsHost } from "./walking/LocomotionVisuals";
import {
  PlayerVisuals,
  type PlayerLocomotionVisual,
} from "./player/PlayerVisuals";
import { getHandAttackAnimation, type PlayerHand } from "../combat/playerHands";
import { Resources } from "../resource";

const runSpeedMultiplier = 2;
export const playerJumpHoldDurationMs = 220;
const jumpHeldGravityMultiplier = 0.3;
const jumpReleasedGravityMultiplier = 1.15;
const jumpFallGravityMultiplier = 0.85;
const playerVitality: LivingVitality = {
  maxHealth: 6,
  damageImmunityDurationMs: 500,
  damageBlinkFrameMs: 90,
};
const playerWalkingTuning: WalkingTuning = {
  walkSpeed: 1.2,
  walkAcceleration: 0.25,
  stopDeceleration: 0.22,
  turnAcceleration: 0.32,
  gravity: 0.2,
  jumpSpeed: -2.8,
  positionScale: 100,
};

export class Player extends WalkingActor {
  isPaused: boolean = false;
  private readonly inputState: PlayerInputState = new PlayerInputState();
  private readonly spawnPosition: ex.Vector;
  private jumpHoldTimeRemainingMs: number = 0;
  private renderInterpolationOffset: ex.Vector = ex.vec(0, 0);
  private previousPhysicsPosition: ex.Vector;
  private currentPhysicsPosition: ex.Vector;
  private visuals: PlayerVisuals;

  constructor(
    pos: ex.Vector,
    tilemap: ex.TileMap,
    collisionWorld?: TileCollisionWorld,
  ) {
    const width = TILE_PX;
    const height = TILE_PX;
    super(
      pos,
      tilemap,
      ex.vec(width, height),
      collisionOffsetForGraphicCenter(ex.vec(TILE_PX / 2, TILE_PX / 2)),
      playerWalkingTuning,
      playerVitality,
      collisionWorld,
    );
    this.spawnPosition = ex.vec(pos.x, pos.y);
    this.previousPhysicsPosition = pos.clone();
    this.currentPhysicsPosition = pos.clone();
    this.visuals = new PlayerVisuals(this);
    this.setEquippedWeaponSprite(Resources.WoodSword);
  }

  public readLocalControls(engine: ex.Engine) {
    if (this.isPaused) {
      return;
    }
    this.inputState.readKeyboard(engine);
  }

  public inputStateHasChanged() {
    return this.inputState.hasChanged();
  }

  public rememberInputState() {
    this.inputState.remember();
  }

  public attemptAttack(hand: PlayerHand) {
    if (this.isPaused) {
      return false;
    }
    return this.triggerAttack(hand);
  }

  protected separationKind(): LivingSeparationKind {
    return "player";
  }

  protected canParticipateInSeparation(canSeparate: boolean) {
    return canSeparate && !this.isPaused && this.isAlive();
  }

  protected canTakeDamage() {
    if (this.isPaused) {
      return false;
    }
    return super.canTakeDamage();
  }

  protected onHealthDepleted() {
    this.respawnAtJoinPosition();
  }

  public triggerAttack(hand: PlayerHand) {
    if (this.isPaused) {
      return false;
    }
    return this.visuals.playHandAttack(getHandAttackAnimation(hand));
  }

  public cancelActiveSwordAttack() {
    this.visuals.endSwordAttackForResync();
  }

  public syncFacingFromKeys() {
    const moveSign = this.inputState.horizontalSign();
    if (moveSign === 0) {
      return;
    }
    this.syncFacingFromHorizontalSign(moveSign);
    this.visuals.updateFacing(this.facingLeft);
  }

  public setFacingLeft(facingLeft: boolean) {
    this.facingLeft = facingLeft;
    this.visuals.updateFacing(facingLeft);
  }

  get keyLeft() {
    return this.inputState.keyLeft;
  }

  set keyLeft(value: boolean) {
    this.inputState.keyLeft = value;
  }

  get keyRight() {
    return this.inputState.keyRight;
  }

  set keyRight(value: boolean) {
    this.inputState.keyRight = value;
  }

  get keyJump() {
    return this.inputState.keyJump;
  }

  set keyJump(value: boolean) {
    this.inputState.keyJump = value;
  }

  get keyDown() {
    return this.inputState.keyDown;
  }

  set keyDown(value: boolean) {
    this.inputState.keyDown = value;
  }

  override onInitialize(engine: ex.Engine) {
    this.visuals.initialize();
    this.syncCollisionToSprite();
    this.initializeLivingActor(engine);
  }

  protected locomotionVisuals(): LocomotionVisualsHost {
    return this.visuals;
  }

  protected horizontalMoveSign() {
    return this.inputState.horizontalSign();
  }

  protected shouldSyncFacingFromMoveSign(moveSign: number) {
    if (this.visuals.isSwordFacingLocked()) {
      return moveSign !== moveSign;
    }
    return moveSign === moveSign;
  }

  protected syncLocomotionVisuals(moveSign: number) {
    if (this.shouldSyncFacingFromMoveSign(moveSign)) {
      this.syncFacingFromHorizontalSign(moveSign);
    }
    const nextVisual: PlayerLocomotionVisual = !this.isGrounded
      ? "jump"
      : this.keyDown
        ? "crouch"
        : moveSign !== 0
          ? "walk"
          : "idle";
    this.visuals.setLocomotionVisual(nextVisual);
    this.visuals.updateFacing(this.facingLeft);
  }

  protected override walkGravityForStep(deltaMs: number) {
    if (!this.isJumping) {
      this.jumpHoldTimeRemainingMs = 0;
      return this.walkingTuning.gravity;
    }
    if (this.shouldHoldJump()) {
      this.jumpHoldTimeRemainingMs = Math.max(
        this.jumpHoldTimeRemainingMs - deltaMs,
        0,
      );
      return this.walkingTuning.gravity * jumpHeldGravityMultiplier;
    }
    this.jumpHoldTimeRemainingMs = 0;
    if (this.vspeed < 0) {
      return this.walkingTuning.gravity * jumpReleasedGravityMultiplier;
    }
    return this.walkingTuning.gravity * jumpFallGravityMultiplier;
  }

  protected override moveWithWalkingGravity(
    dt: number,
    moveSign: number,
    deltaMs: number,
  ) {
    const runMult = this.isRunning ? runSpeedMultiplier : 1;
    const targetHspeed = moveSign * this.walkingTuning.walkSpeed * runMult;
    const horizontalAcceleration = this.horizontalAccelerationFor(moveSign);
    const approachAmount = horizontalAcceleration * 60 * dt;
    this.hspeed =
      this.hspeed < targetHspeed
        ? Math.min(this.hspeed + approachAmount, targetHspeed)
        : Math.max(this.hspeed - approachAmount, targetHspeed);
    if (this.isGrounded) {
      if (this.vspeed > 0) {
        this.vspeed = 0;
      }
    } else {
      this.applyGravity(this.walkGravityForStep(deltaMs), dt);
    }
    this.moveWithVelocity(this.walkingTuning.positionScale, dt);
  }

  private onJump() {
    if (!this.jump(this.walkingTuning.jumpSpeed)) {
      return;
    }
    this.jumpHoldTimeRemainingMs = playerJumpHoldDurationMs;
  }

  protected override onLand() {
    this.jumpHoldTimeRemainingMs = 0;
  }

  public setEquippedWeaponSprite(sprite: ex.ImageSource) {
    this.visuals.setEquippedWeaponSprite(sprite);
  }

  protected override canReceiveKnockback() {
    return !this.isPaused && super.canReceiveKnockback();
  }

  protected override onKnockbackApplied() {
    this.jumpHoldTimeRemainingMs = 0;
  }

  public isSwordAttackActive() {
    return this.visuals.isSwordAttackActive();
  }

  public swordWeaponActor() {
    return this.visuals.swordWeaponActor();
  }

  public swordAttackCycle() {
    return this.visuals.swordAttackCycle();
  }

  public swordAttackElapsedRatio() {
    return this.visuals.swordAttackElapsedRatio();
  }

  protected onSeparatedX(_x: number) {
    void _x;
    this.syncPhysicsInterpolationToCurrentPosition();
  }

  public applyPositionCorrection(
    position: ex.Vector,
    snapDistance: number,
    options?: { forceHardSnap?: boolean },
  ) {
    this.visuals.applyRemotePositionCorrection(position, snapDistance, options);
    this.syncPhysicsInterpolationToCurrentPosition();
  }

  public startJumpHold(durationMs: number) {
    this.jumpHoldTimeRemainingMs = durationMs;
    this.isGrounded = false;
    this.isJumping = true;
    this.syncLocomotionVisuals(this.inputState.horizontalSign());
  }

  public isFacingLeft() {
    return this.facingLeft;
  }

  private respawnAtJoinPosition() {
    this.health = this.maxHealth;
    this.pos = ex.vec(this.spawnPosition.x, this.spawnPosition.y);
    this.hspeed = 0;
    this.vspeed = 0;
    this.clearKnockback();
    this.jumpHoldTimeRemainingMs = 0;
    this.syncPhysicsInterpolationToCurrentPosition();
  }

  public cameraFocusPosition() {
    return this.pos
      .add(this.renderInterpolationOffset)
      .add(ex.vec(this.width / 2, this.height / 2));
  }

  public worldPixelBounds() {
    const world = this.tileCollisionWorld();
    return new ex.BoundingBox(
      0,
      0,
      world.columns * world.tileWidth,
      world.rows * world.tileHeight,
    );
  }

  public setPaused(isPaused: boolean) {
    this.isPaused = isPaused;
    this.visuals.setPaused(isPaused);
    if (!isPaused) {
      return;
    }
    this.keyLeft = false;
    this.keyRight = false;
    this.keyJump = false;
    this.keyDown = false;
    this.hspeed = 0;
    this.vspeed = 0;
    this.clearKnockback();
    this.jumpHoldTimeRemainingMs = 0;
    this.syncPhysicsInterpolationToCurrentPosition();
  }

  private shouldHoldJump() {
    if (!this.keyJump) {
      return false;
    }
    if (!this.isJumping) {
      return false;
    }
    if (this.vspeed >= 0) {
      return false;
    }
    return this.jumpHoldTimeRemainingMs > 0;
  }

  public syncPhysicsInterpolationToCurrentPosition() {
    this.previousPhysicsPosition = this.pos.clone();
    this.currentPhysicsPosition = this.pos.clone();
    this.renderInterpolationOffset = ex.vec(0, 0);
    this.visuals.applyRenderOffset(ex.vec(0, 0));
  }

  private stepInterpolatedPlayerPhysics(keySign: number) {
    this.previousPhysicsPosition = this.currentPhysicsPosition.clone();
    this.stepPlayerPhysics(keySign, this.fixedStepMs);
    this.currentPhysicsPosition = this.pos.clone();
  }

  private syncRenderInterpolation() {
    const alpha = this.physicsAccumulatorMs / this.fixedStepMs;
    const renderPosition = this.previousPhysicsPosition.add(
      this.currentPhysicsPosition
        .sub(this.previousPhysicsPosition)
        .scale(alpha),
    );
    this.renderInterpolationOffset = renderPosition.sub(this.pos);
    this.visuals.applyRenderOffset(this.renderInterpolationOffset);
  }

  private stepPlayerPhysics(keySign: number, delta: number) {
    const dt = delta / 1000;
    const wasGrounded = this.isGrounded;
    if (this.isKnockbackActive()) {
      this.stepKnockbackPhysics(delta);
    }
    if (!this.isKnockbackActive()) {
      this.moveWithWalkingGravity(dt, keySign, delta);
    }
    if (!this.isKnockbackActive() && this.isGrounded && this.keyJump) {
      this.onJump();
    }
    if (!wasGrounded && this.isGrounded) {
      this.onLand();
    }
    this.syncLocomotionVisuals(keySign);
  }

  override onPostUpdate(_engine: ex.Engine, delta: number) {
    const frameDelta = Math.min(delta, this.maxFrameDeltaMs);
    this.visuals.update(frameDelta);
    if (!this.isPaused) {
      const keySign = this.inputState.horizontalSign();
      this.physicsAccumulatorMs += frameDelta;
      while (this.physicsAccumulatorMs >= this.fixedStepMs) {
        this.stepInterpolatedPlayerPhysics(keySign);
        this.physicsAccumulatorMs -= this.fixedStepMs;
      }
      this.syncRenderInterpolation();
    }
    this.syncCollisionToSprite();
    this.tickDamageFeedback(frameDelta);
  }
}
