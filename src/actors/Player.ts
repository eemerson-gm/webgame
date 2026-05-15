import * as ex from "excalibur";
import { GameClient } from "../classes/GameClient";
import { TILE_PX } from "../world/worldConfig";
import { PlayerInputState } from "./PlayerInputState";
import { MovingActor } from "./MovingActor";
import type { EntitySeparationBody, TileCollisionWorld } from "./MovingActor";
import { DamageFlash } from "./DamageableActor";
import { SmashParticleActor } from "./SmashParticleActor";
import { PlayerVisuals, type PlayerVisual } from "./player/PlayerVisuals";
import { PlayerNetworkClient } from "../classes/PlayerNetworkClient";

const approach = (start: number, end: number, amount: number) => {
  if (start < end) {
    return Math.min(start + amount, end);
  }
  return Math.max(start - amount, end);
};

const interpolatePosition = (
  start: ex.Vector,
  end: ex.Vector,
  progress: number,
) =>
  ex.vec(
    start.x * (1 - progress) + end.x * progress,
    start.y * (1 - progress) + end.y * progress,
  );

const localCameraFollowElasticity = 0.14;
const localCameraFollowFriction = 0.22;
const collisionWidth = TILE_PX - 4;
const collisionHeight = TILE_PX - 2;
const collisionOffsetX = (TILE_PX - collisionWidth) / 2;
const collisionOffsetY = TILE_PX - collisionHeight;
const collisionEdgeInset = 0.1;
const walkSpeed = 1.2;
const runSpeedMultiplier = 2;
const walkAcceleration = 0.25;
const stopDeceleration = 0.22;
const turnAcceleration = 0.32;
const gravity = 0.2;
const jumpSpeed = -2.8;
const jumpHoldDurationMs = 220;
const jumpHeldGravityMultiplier = 0.3;
const jumpReleasedGravityMultiplier = 1.15;
const jumpFallGravityMultiplier = 0.85;
const positionScale = 100;
const playerKnockbackHorizontalSpeed = 2.2;
const playerKnockbackVerticalSpeed = -1.4;
const playerKnockbackDurationMs = 240;
const playerKnockbackFriction = 0.94;
const playerMaxHealth = 6;
const playerDamageImmunityDurationMs = 500;
const playerDamageBlinkFrameMs = 90;
const playerFixedStepMs = 1000 / 60;
const playerMaxFrameDeltaMs = playerFixedStepMs * 5;
const attackDurationMsEpsilon = 0;
const positionPrecision = 1000;

const syncedPositionValue = (value: number) =>
  Math.round(value * positionPrecision) / positionPrecision;

export class Player extends MovingActor {
  private client?: GameClient;
  isLocal: boolean = false;
  isPaused: boolean = false;
  public health: number = playerMaxHealth;
  public readonly maxHealth: number = playerMaxHealth;
  private readonly inputState: PlayerInputState = new PlayerInputState();
  private readonly spawnPosition: ex.Vector;
  private damageFlash: DamageFlash;
  private knockbackTimeRemainingMs: number = 0;
  private damageImmunityTimeRemainingMs: number = 0;
  private jumpHoldTimeRemainingMs: number = 0;
  private attackVisual: PlayerVisual | null = null;
  private attackTimeRemainingMs: number = 0;
  private attackForceRestart: boolean = false;
  private isAttackHeld: boolean = false;
  private physicsAccumulatorMs: number = 0;
  private physicsPosition: ex.Vector = ex.vec(0, 0);
  private renderPreviousPosition: ex.Vector = ex.vec(0, 0);

  private visuals: PlayerVisuals;
  private playerNetwork: PlayerNetworkClient;

  constructor(
    pos: ex.Vector,
    tilemap: ex.TileMap,
    client?: GameClient,
    collisionWorld?: TileCollisionWorld,
  ) {
    const width = TILE_PX;
    const height = TILE_PX;
    super(
      pos,
      tilemap,
      ex.vec(width, height),
      {
        offsetX: collisionOffsetX,
        offsetY: collisionOffsetY,
        width: collisionWidth,
        height: collisionHeight,
        edgeInset: collisionEdgeInset,
      },
      collisionWorld,
    );
    this.client = client;
    this.spawnPosition = ex.vec(pos.x, pos.y);
    this.physicsPosition = ex.vec(pos.x, pos.y);
    this.renderPreviousPosition = ex.vec(pos.x, pos.y);
    this.body.enableFixedUpdateInterpolate = false;

    this.visuals = new PlayerVisuals(this);
    this.playerNetwork = new PlayerNetworkClient(client);

    this.damageFlash = new DamageFlash(this, {
      durationMs: playerDamageImmunityDurationMs,
      blinkFrameMs: playerDamageBlinkFrameMs,
    });
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
    this.damageFlash.initialize(engine);
    if (this.client && this.scene) {
      const collisionWorld = this.tileCollisionWorld();
      const worldWidthPx = collisionWorld.columns * collisionWorld.tileWidth;
      const worldHeightPx = collisionWorld.rows * collisionWorld.tileHeight;
      const worldBounds = new ex.BoundingBox(0, 0, worldWidthPx, worldHeightPx);
      this.scene.camera.strategy.elasticToActor(
        this,
        localCameraFollowElasticity,
        localCameraFollowFriction,
      );
      this.scene.camera.strategy.limitCameraBounds(worldBounds);
    }
  }

  private onJump() {
    if (!this.jump(jumpSpeed)) {
      return;
    }
    this.jumpHoldTimeRemainingMs = jumpHoldDurationMs;
    this.playerNetwork.sendUpdate({
      keyJump: true,
    });
  }

  private onLand() {
    this.jumpHoldTimeRemainingMs = 0;
    const roundedX = Math.round(this.pos.x);
    const roundedY = Math.round(this.pos.y);
    this.moveRenderHistoryBy(roundedX - this.pos.x, roundedY - this.pos.y);
    this.pos.x = roundedX;
    this.pos.y = roundedY;
    this.syncPosition();
  }

  public triggerAttackAnimation(visual: PlayerVisual) {
    if (this.isPaused) {
      return;
    }
    if (!this.isAlive()) {
      return;
    }
    if (this.attackTimeRemainingMs > 0) {
      return;
    }
    this.attackVisual = visual;
    const durationMs = this.visuals.durationMsForVisual(visual);
    const effectiveDurationMs = Math.max(durationMs - attackDurationMsEpsilon, 0);
    this.attackTimeRemainingMs = effectiveDurationMs;
    this.attackForceRestart = true;
  }

  public setAttackHeld(held: boolean, visual: PlayerVisual) {
    if (this.isPaused) {
      this.isAttackHeld = false;
      return;
    }
    this.isAttackHeld = held;
    if (!held) {
      return;
    }
    if (this.attackVisual === null || this.attackTimeRemainingMs <= 0) {
      this.triggerAttackAnimation(visual);
    }
  }

  public triggerSwordGroundAnimation() {
    this.triggerAttackAnimation("ground_sword");
  }

  public setSwordGroundHeld(held: boolean) {
    this.setAttackHeld(held, "ground_sword");
  }

  public knockBackFrom(actor: ex.Actor) {
    if (this.isPaused) {
      return;
    }
    const actorCenterX = actor.pos.x + actor.width / 2;
    const direction = this.centerX() < actorCenterX ? -1 : 1;
    this.hspeed = playerKnockbackHorizontalSpeed * direction;
    this.vspeed = playerKnockbackVerticalSpeed;
    this.knockbackTimeRemainingMs = playerKnockbackDurationMs;
    this.jumpHoldTimeRemainingMs = 0;
    const movementState = {
      ...this.currentMovementState(),
    };
    this.playerNetwork.sendUpdate(movementState);
  }

  public takeDamageFrom(
    actor: ex.Actor,
    damage: number = 1,
    damageFeedback: "full" | "flash" = "full",
  ) {
    if (!this.canTakeDamage()) {
      return false;
    }
    this.health = Math.max(this.health - damage, 0);
    this.damageImmunityTimeRemainingMs = playerDamageImmunityDurationMs;
    this.showDamageFeedback(this.damageParticlePosition(), damageFeedback);
    if (this.health <= 0) {
      this.respawnAtJoinPosition();
      return true;
    }
    this.knockBackFrom(actor);
    this.syncHealthState();
    return true;
  }

  public isAlive() {
    return this.health > 0;
  }

  public entitySeparationBody(
    playerId: string,
    canSeparate: boolean,
  ): EntitySeparationBody {
    return {
      id: `player:${playerId}`,
      x: this.pos.x,
      y: this.pos.y,
      horizontalSpeed: this.hspeed,
      verticalSpeed: this.vspeed,
      width: this.width,
      height: this.height,
      isGrounded: this.isGrounded,
      isJumping: this.isJumping,
      collisionBounds: this.collisionBounds,
      canSeparate: canSeparate && !this.isPaused && this.isAlive(),
    };
  }

  public applySeparatedX(x: number) {
    if (this.pos.x === x) {
      return;
    }
    const deltaX = x - this.pos.x;
    this.moveRenderHistoryBy(deltaX, 0);
    this.pos.x = x;
    this.physicsPosition.x = x;
    this.updateRenderInterpolation(this.physicsAccumulatorMs / playerFixedStepMs);
    this.playerNetwork.markPositionChanged();
    this.playerNetwork.setShouldBroadcastSeparatedPosition(true);
  }

  public applyRemotePositionCorrection(
    position: ex.Vector,
    snapDistance: number,
  ) {
    this.visuals.applyRemotePositionCorrection(position, snapDistance);
    this.resetRenderInterpolation();
  }

  public isFacingLeft() {
    return this.facingLeft;
  }

  public syncHealth(health: unknown) {
    const nextHealth = Number(health);
    if (!Number.isFinite(nextHealth)) {
      return;
    }
    const previousHealth = this.health;
    this.health = Math.max(0, Math.min(nextHealth, this.maxHealth));
    if (this.health < previousHealth) {
      this.damageFlash.start();
    }
  }

  private damageParticlePosition() {
    return ex.vec(this.pos.x + this.width / 2, this.pos.y + this.height / 2);
  }

  private showDamageFeedback(
    position: ex.Vector,
    damageFeedback: "full" | "flash" = "full",
  ) {
    this.damageFlash.start();
    if (damageFeedback === "flash") {
      return;
    }
    this.scene?.add(new SmashParticleActor(position));
  }

  private canTakeDamage() {
    if (this.isPaused) {
      return false;
    }
    if (this.damageImmunityTimeRemainingMs > 0) {
      return false;
    }
    return this.health > 0;
  }

  private respawnAtJoinPosition() {
    this.health = this.maxHealth;
    this.pos = ex.vec(this.spawnPosition.x, this.spawnPosition.y);
    this.resetRenderInterpolation();
    this.hspeed = 0;
    this.vspeed = 0;
    this.knockbackTimeRemainingMs = 0;
    this.jumpHoldTimeRemainingMs = 0;
    this.attackVisual = null;
    this.attackTimeRemainingMs = 0;
    this.attackForceRestart = false;
    this.isAttackHeld = false;
    this.syncHealthState();
  }

  public syncPauseState(isPaused: boolean) {
    const position = this.currentPosition();
    this.setPaused(isPaused);
    this.playerNetwork.sendUpdate({
      isPaused,
      keyLeft: false,
      keyRight: false,
      keyJump: false,
      keyDown: false,
      horizontalSpeed: 0,
      verticalSpeed: 0,
      ...position,
    });
  }

  public setPaused(isPaused: boolean) {
    this.isPaused = isPaused;
    this.visuals.setPaused(isPaused);
    if (!isPaused) {
      return;
    }
    this.isAttackHeld = false;
    this.keyLeft = false;
    this.keyRight = false;
    this.keyJump = false;
    this.keyDown = false;
    this.hspeed = 0;
    this.vspeed = 0;
    this.knockbackTimeRemainingMs = 0;
    this.jumpHoldTimeRemainingMs = 0;
    this.attackVisual = null;
    this.attackTimeRemainingMs = 0;
    this.attackForceRestart = false;
    this.visuals.setVisual("idle");
  }

  private currentPosition() {
    return {
      x: syncedPositionValue(this.pos.x),
      y: syncedPositionValue(this.pos.y),
    };
  }

  private currentMovementState() {
    const position = this.currentPosition();
    return {
      ...position,
      horizontalSpeed: this.hspeed,
      verticalSpeed: this.vspeed,
    };
  }

  private syncPosition() {
    const position = this.currentPosition();
    this.playerNetwork.sendUpdate(position);
  }

  private syncHealthState() {
    const movementState = {
      ...this.currentMovementState(),
      health: this.health,
    };
    this.playerNetwork.sendUpdate(movementState, movementState);
  }

  private onMove() {
    if (!this.inputState.hasChanged()) {
      return;
    }
    const shouldSyncPosition = this.inputState.shouldSyncPosition(this.isGrounded);
    const movementState = shouldSyncPosition ? this.currentMovementState() : {};
    const payload = this.inputState.payload(movementState);
    const statePatch = this.inputState.statePatch(shouldSyncPosition, payload);
    this.playerNetwork.sendUpdate(payload, statePatch === payload ? undefined : statePatch);
    this.inputState.remember();
  }

  private updateControls(engine: ex.Engine) {
    if (!this.client) {
      return;
    }
    if (this.isPaused) {
      return;
    }
    this.inputState.readKeyboard(engine);
  }

  private canTurnFromInput() {
    return true;
  }

  private syncPlayerVisuals(keySign: number) {
    if (this.canTurnFromInput()) {
      this.syncFacingFromHorizontalSign(keySign);
    }
    const baseVisual: PlayerVisual = !this.isGrounded
      ? "jump"
      : this.keyDown
        ? "crouch"
        : keySign !== 0
          ? "walk"
          : "idle";

    const hasAttack =
      this.attackVisual !== null && this.attackTimeRemainingMs > 0;
    let nextVisual: PlayerVisual = baseVisual;
    if (hasAttack) {
      nextVisual = this.attackVisual as PlayerVisual;
    }
    const force = this.attackForceRestart;
    this.attackForceRestart = false;

    this.visuals.setVisual(nextVisual, force);
    this.visuals.updateFacing(this.facingLeft);
  }

  private horizontalAccelerationFor(keySign: number) {
    if (keySign === 0) {
      return stopDeceleration;
    }
    if (Math.sign(this.hspeed) !== 0 && Math.sign(this.hspeed) !== keySign) {
      return turnAcceleration;
    }
    return walkAcceleration;
  }

  private moveWithGravity(delta: number, dt: number, keySign: number) {
    const targetHspeed =
      keySign * walkSpeed * (this.isRunning ? runSpeedMultiplier : 1);
    const horizontalAcceleration = this.horizontalAccelerationFor(keySign);

    this.hspeed = approach(
      this.hspeed,
      targetHspeed,
      horizontalAcceleration * 60 * dt,
    );
    this.applyGravity(this.currentJumpGravity(delta), dt);

    this.moveWithVelocity(positionScale, dt);
  }

  private currentJumpGravity(delta: number) {
    if (!this.isJumping) {
      this.jumpHoldTimeRemainingMs = 0;
      return gravity;
    }
    if (this.shouldHoldJump()) {
      this.jumpHoldTimeRemainingMs = Math.max(
        this.jumpHoldTimeRemainingMs - delta,
        0,
      );
      return gravity * jumpHeldGravityMultiplier;
    }
    this.jumpHoldTimeRemainingMs = 0;
    if (this.vspeed < 0) {
      return gravity * jumpReleasedGravityMultiplier;
    }
    return gravity * jumpFallGravityMultiplier;
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

  private moveWithKnockback(delta: number, dt: number) {
    this.knockbackTimeRemainingMs = Math.max(
      this.knockbackTimeRemainingMs - delta,
      0,
    );
    this.applyGravity(gravity, dt);
    this.moveWithVelocity(positionScale, dt);
    this.hspeed *= playerKnockbackFriction;
  }

  private updateDamageFeedback(delta: number) {
    this.damageImmunityTimeRemainingMs = Math.max(
      this.damageImmunityTimeRemainingMs - delta,
      0,
    );
    this.damageFlash.tick(delta);
  }

  private moveRenderHistoryBy(deltaX: number, deltaY: number) {
    this.renderPreviousPosition.x += deltaX;
    this.renderPreviousPosition.y += deltaY;
  }

  private resetRenderInterpolation() {
    this.physicsAccumulatorMs = 0;
    this.physicsPosition = ex.vec(this.pos.x, this.pos.y);
    this.renderPreviousPosition = ex.vec(this.physicsPosition.x, this.physicsPosition.y);
    this.visuals.applyRenderOffset(ex.vec(0, 0));
  }

  private updateRenderInterpolation(progress: number) {
    const renderPosition = interpolatePosition(
      this.renderPreviousPosition,
      this.physicsPosition,
      progress,
    );
    this.pos.x = renderPosition.x;
    this.pos.y = renderPosition.y;
    this.visuals.applyRenderOffset(ex.vec(0, 0));
  }

  private stepPlayerFrame(engine: ex.Engine, delta: number) {
    const frameDelta = Math.min(delta, playerMaxFrameDeltaMs);
    this.physicsAccumulatorMs += frameDelta;
    if (this.isPaused) {
      this.stepPausedPlayerFrame();
      return;
    }
    this.pos.x = this.physicsPosition.x;
    this.pos.y = this.physicsPosition.y;
    this.updateControls(engine);
    const keySign = this.inputState.horizontalSign();
    this.consumeFixedPlayerSteps(keySign);
    this.onMove();
    this.physicsPosition = ex.vec(this.pos.x, this.pos.y);
    this.updateRenderInterpolation(this.physicsAccumulatorMs / playerFixedStepMs);
  }

  private stepPausedPlayerFrame() {
    this.consumePausedFixedSteps();
    this.pos.x = this.physicsPosition.x;
    this.pos.y = this.physicsPosition.y;
    this.renderPreviousPosition = ex.vec(this.physicsPosition.x, this.physicsPosition.y);
    this.updateRenderInterpolation(0);
  }

  private consumePausedFixedSteps() {
    if (this.physicsAccumulatorMs < playerFixedStepMs) {
      return;
    }
    this.physicsAccumulatorMs -= playerFixedStepMs;
    this.consumePausedFixedSteps();
  }

  private consumeFixedPlayerSteps(keySign: number) {
    if (this.physicsAccumulatorMs < playerFixedStepMs) {
      return;
    }
    this.renderPreviousPosition = ex.vec(this.pos.x, this.pos.y);
    this.physicsAccumulatorMs -= playerFixedStepMs;
    this.stepPlayerPhysics(keySign, playerFixedStepMs);
    this.consumeFixedPlayerSteps(keySign);
  }

  private stepPlayerPhysics(keySign: number, delta: number) {
    const dt = delta / 1000;
    if (this.attackVisual !== null) {
      this.attackTimeRemainingMs = Math.max(
        this.attackTimeRemainingMs - delta,
        0,
      );
      if (this.attackTimeRemainingMs === 0) {
        if (this.isAttackHeld) {
          const visual = this.attackVisual;
          const durationMs = this.visuals.durationMsForVisual(visual);
          const effectiveDurationMs = Math.max(
            durationMs - attackDurationMsEpsilon,
            0,
          );
          this.attackTimeRemainingMs = effectiveDurationMs;
          this.attackForceRestart = true;
        }
        if (!this.isAttackHeld) {
          this.attackVisual = null;
          this.attackForceRestart = true;
        }
      }
    }

    const previousGrounded = this.isGrounded;
    const isKnockbackActive = this.knockbackTimeRemainingMs > 0;
    if (isKnockbackActive) {
      this.moveWithKnockback(delta, dt);
    }
    if (!isKnockbackActive) {
      this.moveWithGravity(delta, dt, keySign);
    }

    if (
      !isKnockbackActive &&
      this.isGrounded &&
      this.keyJump
    ) {
      this.onJump();
    }
    if (!isKnockbackActive && !previousGrounded && this.isGrounded) {
      this.onLand();
    }

    this.syncPlayerVisuals(keySign);

    this.playerNetwork.syncMovementPeriodically(
      delta,
      {
        ...this.currentMovementState(),
      },
      isKnockbackActive,
    );
  }

  override onPostUpdate(engine: ex.Engine, delta: number) {
    this.stepPlayerFrame(engine, delta);
    this.visuals.updateVisualCorrection(delta);
    this.updateDamageFeedback(delta);
  }
}
