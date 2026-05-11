import * as ex from "excalibur";
import { GameClient } from "../classes/GameClient";
import { messageTypes } from "../classes/GameProtocol";
import type { Data } from "../classes/GameProtocol";
import { TILE_PX } from "../world/worldConfig";
import { PlayerInputState } from "./PlayerInputState";
import { MovingActor } from "./MovingActor";
import type {
  EntitySeparationBody,
  TileCollisionWorld,
} from "../simulation/entityPhysics";
import { DamageFlash } from "./DamageableActor";
import { SmashParticleActor } from "./SmashParticleActor";
import { PlayerVisuals, type PlayerVisual } from "./player/PlayerVisuals";
import { PlayerNetworkSync } from "./player/PlayerNetworkSync";

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
const flySpeed = 2.4;
const flyAcceleration = 0.45;
const playerKnockbackHorizontalSpeed = 2.2;
const playerKnockbackVerticalSpeed = -1.4;
const playerKnockbackDurationMs = 240;
const playerKnockbackFriction = 0.94;
const playerMaxHealth = 6;
const playerDamageImmunityDurationMs = 500;
const playerDamageBlinkFrameMs = 90;
const playerFixedStepMs = 1000 / 60;
const playerMaxFrameDeltaMs = playerFixedStepMs * 5;
const positionPrecision = 1000;

const syncedPositionValue = (value: number) =>
  Math.round(value * positionPrecision) / positionPrecision;

export class Player extends MovingActor {
  private client?: GameClient;
  isLocal: boolean = false;
  isFlying: boolean = false;
  isPaused: boolean = false;
  public health: number = playerMaxHealth;
  public readonly maxHealth: number = playerMaxHealth;
  private readonly inputState: PlayerInputState = new PlayerInputState();
  private readonly spawnPosition: ex.Vector;
  private damageFlash: DamageFlash;
  private knockbackTimeRemainingMs: number = 0;
  private damageImmunityTimeRemainingMs: number = 0;
  private jumpHoldTimeRemainingMs: number = 0;
  private physicsAccumulatorMs: number = 0;
  private renderPreviousPosition: ex.Vector = ex.vec(0, 0);

  private visuals: PlayerVisuals;
  private networkSync: PlayerNetworkSync;

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
    this.renderPreviousPosition = ex.vec(pos.x, pos.y);
    this.body.enableFixedUpdateInterpolate = false;

    this.visuals = new PlayerVisuals(this);
    this.networkSync = new PlayerNetworkSync(client);

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
      const worldWidthPx = this.tilemap.columns * this.tilemap.tileWidth;
      const worldHeightPx = this.tilemap.rows * this.tilemap.tileHeight;
      const worldBounds = new ex.BoundingBox(0, 0, worldWidthPx, worldHeightPx);
      this.scene.camera.strategy.elasticToActor(
        this,
        localCameraFollowElasticity,
        localCameraFollowFriction,
      );
      this.scene.camera.strategy.limitCameraBounds(worldBounds);
    }
  }

  private sendClient(type: string, payload: Data, playerData?: Data) {
    if (!this.client) {
      return;
    }
    this.client.send(type, payload, playerData);
  }

  private onJump() {
    if (!this.jump(jumpSpeed)) {
      return;
    }
    this.jumpHoldTimeRemainingMs = jumpHoldDurationMs;
    this.sendClient(messageTypes.updatePlayer, {
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

  public knockBackFrom(actor: ex.Actor) {
    if (this.isPaused) {
      return;
    }
    if (this.isFlying) {
      return;
    }
    const actorCenterX = actor.pos.x + actor.width / 2;
    const direction = this.centerX() < actorCenterX ? -1 : 1;
    this.isFlying = false;
    this.hspeed = playerKnockbackHorizontalSpeed * direction;
    this.vspeed = playerKnockbackVerticalSpeed;
    this.knockbackTimeRemainingMs = playerKnockbackDurationMs;
    this.jumpHoldTimeRemainingMs = 0;
    const movementState = {
      ...this.currentMovementState(),
      isFlying: this.isFlying,
    };
    this.sendClient(messageTypes.updatePlayer, movementState);
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
    this.moveRenderHistoryBy(x - this.pos.x, 0);
    this.pos.x = x;
    this.updateRenderInterpolation(
      this.physicsAccumulatorMs / playerFixedStepMs,
    );
    this.networkSync.markPositionChanged();
    this.networkSync.setShouldBroadcastSeparatedPosition(true);
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
    if (this.isFlying) {
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
    this.isFlying = false;
    this.knockbackTimeRemainingMs = 0;
    this.jumpHoldTimeRemainingMs = 0;
    this.syncHealthState();
  }

  public syncPauseState(isPaused: boolean) {
    const position = this.currentPosition();
    this.setPaused(isPaused);
    this.sendClient(messageTypes.updatePlayer, {
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
    this.keyLeft = false;
    this.keyRight = false;
    this.keyJump = false;
    this.keyDown = false;
    this.hspeed = 0;
    this.vspeed = 0;
    this.knockbackTimeRemainingMs = 0;
    this.jumpHoldTimeRemainingMs = 0;
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
    this.sendClient(messageTypes.updatePlayer, position);
  }

  private syncHealthState() {
    const movementState = {
      ...this.currentMovementState(),
      health: this.health,
      isFlying: this.isFlying,
    };
    this.sendClient(messageTypes.updatePlayer, movementState, movementState);
  }

  private onMove() {
    if (!this.inputState.hasChanged(this.isFlying)) {
      return;
    }
    const shouldSyncPosition = this.inputState.shouldSyncPosition(
      this.isGrounded,
      this.isFlying,
    );
    const movementState = shouldSyncPosition ? this.currentMovementState() : {};
    const payload = this.inputState.payload(this.isFlying, movementState);
    const statePatch = this.inputState.statePatch(
      this.isFlying,
      shouldSyncPosition,
      payload,
    );
    this.sendClient(
      messageTypes.updatePlayer,
      payload,
      statePatch === payload ? undefined : statePatch,
    );
    this.inputState.remember(this.isFlying);
  }

  private updateControls(engine: ex.Engine) {
    if (!this.client) {
      return;
    }
    if (this.isPaused) {
      return;
    }
    const controlState = this.inputState.readKeyboard(engine, this.isFlying);
    this.isFlying = controlState.isFlying;
    if (controlState.didToggleFlying) {
      this.hspeed = 0;
      this.vspeed = 0;
    }
  }

  private canTurnFromInput() {
    return true;
  }

  private syncPlayerVisuals(keySign: number) {
    if (this.canTurnFromInput()) {
      this.syncFacingFromHorizontalSign(keySign);
    }
    const nextVisual: PlayerVisual = !this.isGrounded
      ? "jump"
      : this.keyDown && !this.isFlying
        ? "crouch"
        : keySign !== 0
          ? "walk"
          : "idle";

    this.visuals.setVisual(nextVisual);
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

  private flyVerticalInput() {
    return this.inputState.flyingVerticalSign();
  }

  private moveWithFlying(dt: number, keySign: number) {
    const verticalSign = this.flyVerticalInput();
    this.hspeed = approach(
      this.hspeed,
      keySign * flySpeed,
      flyAcceleration * 60 * dt,
    );
    this.vspeed = approach(
      this.vspeed,
      verticalSign * flySpeed,
      flyAcceleration * 60 * dt,
    );
    this.moveFreely(positionScale, dt);
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
    this.renderPreviousPosition = ex.vec(this.pos.x, this.pos.y);
    this.visuals.applyRenderOffset(ex.vec(0, 0));
  }

  private updateRenderInterpolation(progress: number) {
    const renderPosition = interpolatePosition(
      this.renderPreviousPosition,
      this.pos,
      progress,
    );
    this.visuals.applyRenderOffset(renderPosition.sub(this.pos));
  }

  private stepPlayerFrame(engine: ex.Engine, delta: number) {
    const frameDelta = Math.min(delta, playerMaxFrameDeltaMs);
    this.physicsAccumulatorMs += frameDelta;
    if (this.isPaused) {
      this.stepPausedPlayerFrame();
      return;
    }
    this.updateControls(engine);
    const keySign = this.inputState.horizontalSign();
    this.consumeFixedPlayerSteps(keySign);
    this.onMove();
    this.updateRenderInterpolation(
      this.physicsAccumulatorMs / playerFixedStepMs,
    );
  }

  private stepPausedPlayerFrame() {
    this.consumePausedFixedSteps();
    this.renderPreviousPosition = ex.vec(this.pos.x, this.pos.y);
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

    const previousGrounded = this.isGrounded;
    const isKnockbackActive = this.knockbackTimeRemainingMs > 0;
    if (isKnockbackActive) {
      this.moveWithKnockback(delta, dt);
    }
    if (!isKnockbackActive && this.isFlying) {
      this.moveWithFlying(dt, keySign);
    }
    if (!isKnockbackActive && !this.isFlying) {
      this.moveWithGravity(delta, dt, keySign);
    }

    if (
      !isKnockbackActive &&
      !this.isFlying &&
      this.isGrounded &&
      this.keyJump
    ) {
      this.onJump();
    }
    if (!this.isFlying && !previousGrounded && this.isGrounded) {
      this.onLand();
    }

    this.syncPlayerVisuals(keySign);

    this.networkSync.syncMovementPeriodically(
      delta,
      {
        ...this.currentMovementState(),
        isFlying: this.isFlying,
      },
      isKnockbackActive,
    );
  }

  override onPostUpdate(engine: ex.Engine, delta: number) {
    this.visuals.updateVisualCorrection(delta);
    this.updateDamageFeedback(delta);
    this.stepPlayerFrame(engine, delta);
  }
}
