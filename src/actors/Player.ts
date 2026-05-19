import * as ex from "excalibur";
import { GameClient } from "../classes/GameClient";
import { TILE_PX } from "../world/worldConfig";
import { PlayerInputState } from "./PlayerInputState";
import { MovingActor } from "./MovingActor";
import type { EntitySeparationBody, TileCollisionWorld } from "./MovingActor";
import { DamageFlash } from "./DamageableActor";
import { PlayerVisuals, type PlayerVisual } from "./player/PlayerVisuals";
import { PlayerNetworkClient } from "../classes/PlayerNetworkClient";

const approach = (start: number, end: number, amount: number) => {
  if (start < end) {
    return Math.min(start + amount, end);
  }
  return Math.max(start - amount, end);
};

const collisionWidth = TILE_PX - 4;
const collisionHeight = TILE_PX - 2;
const collisionEdgeInset = 0.1;

const playerBodyRestCenterY = TILE_PX / 2;

const collisionOffsetForGraphicCenter = (center: ex.Vector) => ({
  offsetX: center.x - collisionWidth / 2,
  offsetY:
    TILE_PX - collisionHeight + (center.y - playerBodyRestCenterY),
  width: collisionWidth,
  height: collisionHeight,
  edgeInset: collisionEdgeInset,
});
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
  private physicsAccumulatorMs: number = 0;

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
      collisionOffsetForGraphicCenter(
        ex.vec(TILE_PX / 2, TILE_PX / 2),
      ),
      collisionWorld,
    );
    this.client = client;
    this.isLocal = client !== undefined;
    this.spawnPosition = ex.vec(pos.x, pos.y);

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
    this.syncCollisionToSprite();
    this.damageFlash.initialize(engine);
    if (this.client && this.scene) {
      const collisionWorld = this.tileCollisionWorld();
      const worldWidthPx = collisionWorld.columns * collisionWorld.tileWidth;
      const worldHeightPx = collisionWorld.rows * collisionWorld.tileHeight;
      const worldBounds = new ex.BoundingBox(0, 0, worldWidthPx, worldHeightPx);
      this.scene.camera.strategy.lockToActor(this);
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
    this.syncPosition();
  }

  public setEquippedWeaponSprite(sprite: ex.ImageSource) {
    this.visuals.setEquippedWeaponSprite(sprite);
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

  public takeDamageFrom(actor: ex.Actor, damage: number = 1) {
    if (!this.canTakeDamage()) {
      return false;
    }
    this.health = Math.max(this.health - damage, 0);
    this.damageImmunityTimeRemainingMs = playerDamageImmunityDurationMs;
    this.damageFlash.start();
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
    this.pos.x = x;
    this.playerNetwork.markPositionChanged();
    this.playerNetwork.setShouldBroadcastSeparatedPosition(true);
  }

  public applyRemotePositionCorrection(
    position: ex.Vector,
    snapDistance: number,
  ) {
    if (this.isLocal) {
      return;
    }
    this.visuals.applyRemotePositionCorrection(position, snapDistance);
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
    this.hspeed = 0;
    this.vspeed = 0;
    this.knockbackTimeRemainingMs = 0;
    this.jumpHoldTimeRemainingMs = 0;
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

  private syncCollisionToSprite() {
    const center = this.visuals.bodyGraphicCenter();
    const next = collisionOffsetForGraphicCenter(center);
    this.collisionBounds.offsetX = next.offsetX;
    this.collisionBounds.offsetY = next.offsetY;
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

  private syncPlayerVisuals(keySign: number) {
    this.syncFacingFromHorizontalSign(keySign);
    const nextVisual: PlayerVisual = !this.isGrounded
      ? "jump"
      : this.keyDown
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

  private moveWithGravity(delta: number, dt: number, keySign: number) {
    const runMult = this.isRunning ? runSpeedMultiplier : 1;
    const targetHspeed = keySign * walkSpeed * runMult;
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

  private stepPlayerPhysics(keySign: number, delta: number) {
    const dt = delta / 1000;

    const wasJumping = this.isJumping;
    const isKnockbackActive = this.knockbackTimeRemainingMs > 0;
    if (isKnockbackActive) {
      this.moveWithKnockback(delta, dt);
    }
    if (!isKnockbackActive) {
      this.moveWithGravity(delta, dt, keySign);
    }

    if (!isKnockbackActive && this.isGrounded && this.keyJump) {
      this.onJump();
    }
    if (!isKnockbackActive && wasJumping && this.isGrounded) {
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
    const frameDelta = Math.min(delta, playerMaxFrameDeltaMs);
    this.visuals.updateVisualCorrection(frameDelta);
    this.syncCollisionToSprite();
    if (!this.isPaused) {
      this.updateControls(engine);
      const keySign = this.inputState.horizontalSign();
      this.physicsAccumulatorMs += frameDelta;
      while (this.physicsAccumulatorMs >= playerFixedStepMs) {
        this.stepPlayerPhysics(keySign, playerFixedStepMs);
        this.physicsAccumulatorMs -= playerFixedStepMs;
      }
      this.onMove();
    }
    this.updateDamageFeedback(frameDelta);
  }
}
