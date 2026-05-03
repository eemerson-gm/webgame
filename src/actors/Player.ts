import * as ex from "excalibur";
import { Resources } from "../resource";
import { GameClient } from "../classes/GameClient";
import { messageTypes } from "../classes/GameProtocol";
import type { Data, PlayerPowerup } from "../classes/GameProtocol";
import {
  attachedVisualHiddenPosition,
  type AttachedVisualAnimation,
} from "../classes/AttachedVisualAnimation";
import {
  isPlayerPowerup,
  powerupHasBehavior,
  powerupVisualsFor,
  type PowerupBehavior,
} from "../classes/Powerups";
import { TILE_PX } from "../world/worldConfig";
import { PlayerInputState } from "./PlayerInputState";
import { MovingActor } from "./MovingActor";
import type { TileCollisionWorld } from "../simulation/entityPhysics";
import { DamageFlash } from "./DamageableActor";
import { SmashParticleActor } from "./SmashParticleActor";

const approach = (start: number, end: number, amount: number) => {
  if (start < end) {
    return Math.min(start + amount, end);
  }
  return Math.max(start - amount, end);
};

const localCameraFollowElasticity = 0.14;
const localCameraFollowFriction = 0.22;
const collisionWidth = TILE_PX - 4;
const collisionHeight = TILE_PX - 2;
const collisionOffsetX = (TILE_PX - collisionWidth) / 2;
const collisionOffsetY = TILE_PX - collisionHeight;
const collisionEdgeInset = 0.1;
const walkSpeed = 1.25;
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
const positionPrecision = 1000;
const serverMovementSyncIntervalMs = 150;
const serverKnockbackMovementSyncIntervalMs = 50;
const serverMovementPositionThreshold = 0.5;
const serverMovementSpeedThreshold = 0.05;
const sleepBubbleOffset = ex.vec(TILE_PX / 2, -2);
const sleepBubbleAnchor = ex.vec(0.5, 1);
type PlayerVisual = "idle" | "walk" | "jump" | "crouch" | "usePowerup";

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
  private idleSprite: ex.Sprite = Resources.Player.toSprite();
  private jumpSprite: ex.Sprite = Resources.PlayerJump.toSprite();
  private crouchSprite: ex.Sprite = Resources.PlayerCrouch.toSprite();
  private sleepBubbleActor: ex.Actor;
  private powerupAttachmentActor: ex.Actor;
  private damageFlash: DamageFlash;
  private currentVisual: PlayerVisual = "idle";
  private activePowerup: PlayerPowerup = "none";
  private walkAnimation!: ex.Animation;
  private usePowerupAnimation!: AttachedVisualAnimation;
  private usePowerupTimeRemainingMs: number = 0;
  private knockbackTimeRemainingMs: number = 0;
  private damageImmunityTimeRemainingMs: number = 0;
  private jumpHoldTimeRemainingMs: number = 0;
  private serverMovementSyncElapsedMs: number = 0;
  private lastServerMovementState?: Data;

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
    this.powerupAttachmentActor = new ex.Actor({
      pos: attachedVisualHiddenPosition(),
      anchor: ex.vec(0, 0),
      width: TILE_PX,
      height: TILE_PX,
      z: -1,
    });
    this.applyPowerupVisuals("none");
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

  get isUsingPowerup() {
    return this.usePowerupTimeRemainingMs > 0;
  }

  override onInitialize(engine: ex.Engine) {
    this.walkAnimation.pause();
    this.graphics.use(this.idleSprite);
    this.addChild(this.powerupAttachmentActor);
    this.addChild(this.sleepBubbleActor);
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
    this.syncPosition();
  }

  private sendPowerupUseState(isUsingPowerup: boolean) {
    const position = this.currentPosition();
    const activePowerup = this.activePowerup;
    this.sendClient(messageTypes.updatePlayer, {
      isUsingPowerup,
      activePowerup,
      ...position,
    });
  }

  public usePowerup(durationMs?: number) {
    if (this.isPaused) {
      return false;
    }
    if (this.isUsingPowerup) {
      return false;
    }
    const actualDurationMs = durationMs ?? this.usePowerupAnimation.durationMs;
    this.beginUsingPowerup(actualDurationMs);
    this.sendPowerupUseState(true);
    return true;
  }

  public keepUsingPowerup(
    durationMs: number,
    powerup: PlayerPowerup = this.activePowerup,
  ) {
    if (powerup !== this.activePowerup) {
      this.syncPowerupState(powerup);
    }
    if (!this.isUsingPowerup) {
      return this.usePowerup(durationMs);
    }
    this.usePowerupTimeRemainingMs = Math.max(
      this.usePowerupTimeRemainingMs,
      durationMs,
    );
    this.sendPowerupUseState(true);
    return true;
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

  public currentPowerup() {
    return this.activePowerup;
  }

  public currentPowerupCan(behavior: PowerupBehavior) {
    return powerupHasBehavior(this.activePowerup, behavior);
  }

  public syncPowerupState(powerup: unknown) {
    if (!isPlayerPowerup(powerup)) {
      return;
    }
    if (powerup === this.activePowerup) {
      return;
    }
    this.activePowerup = powerup;
    this.applyPowerupVisuals(powerup);
    const position = this.currentPosition();
    this.sendClient(messageTypes.updatePlayer, {
      activePowerup: powerup,
      isUsingPowerup: this.isUsingPowerup,
      ...position,
    });
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
    this.hspeed = 0;
    this.vspeed = 0;
    this.isFlying = false;
    this.knockbackTimeRemainingMs = 0;
    this.jumpHoldTimeRemainingMs = 0;
    this.syncHealthState();
  }

  public stopUsingPowerupAction() {
    if (!this.isUsingPowerup) {
      return;
    }
    this.stopUsingPowerup();
    this.sendPowerupUseState(false);
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
      isUsingPowerup: false,
      activePowerup: this.activePowerup,
      horizontalSpeed: 0,
      verticalSpeed: 0,
      ...position,
    });
  }

  public setPaused(isPaused: boolean) {
    this.isPaused = isPaused;
    this.sleepBubbleActor.graphics.visible = isPaused;
    this.sleepBubbleActor.graphics.opacity = isPaused ? 1 : 0;
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
    this.stopUsingPowerup();
    this.walkAnimation.pause();
    this.currentVisual = "idle";
    this.graphics.use(this.idleSprite);
  }

  public syncPowerupUseState(
    isUsingPowerup: boolean,
    durationMs?: number,
    powerup: unknown = this.activePowerup,
  ) {
    if (isPlayerPowerup(powerup) && powerup !== this.activePowerup) {
      this.syncPowerupState(powerup);
    }
    const actualDurationMs = durationMs ?? this.usePowerupAnimation.durationMs;
    if (isUsingPowerup && !this.isUsingPowerup) {
      this.beginUsingPowerup(actualDurationMs);
      return;
    }
    if (isUsingPowerup && this.isUsingPowerup) {
      this.usePowerupTimeRemainingMs = Math.max(
        this.usePowerupTimeRemainingMs,
        actualDurationMs,
      );
      return;
    }
    if (!isUsingPowerup && this.isUsingPowerup) {
      this.stopUsingPowerup();
    }
  }

  private beginUsingPowerup(durationMs: number) {
    this.usePowerupTimeRemainingMs = durationMs;
    if (this.currentVisual === "walk") {
      this.walkAnimation.pause();
    }
    this.currentVisual = "usePowerup";
    this.usePowerupAnimation.reset();
    this.graphics.use(this.usePowerupAnimation.graphic);
    this.usePowerupAnimation.play();
    this.usePowerupAnimation.update(0, this.facingLeft);
  }

  private stopUsingPowerup() {
    this.usePowerupTimeRemainingMs = 0;
    this.usePowerupAnimation.pause();
    this.usePowerupAnimation.hideAttachment();
    if (this.currentVisual === "usePowerup") {
      this.currentVisual = "idle";
      this.graphics.use(this.idleSprite);
    }
  }

  private applyPowerupVisuals(powerup: PlayerPowerup) {
    const visuals = powerupVisualsFor(powerup, this.powerupAttachmentActor, TILE_PX);
    const isWalking = this.currentVisual === "walk";
    const isUsingPowerup = this.isUsingPowerup;
    if (isWalking) {
      this.walkAnimation.pause();
    }
    if (isUsingPowerup) {
      this.usePowerupAnimation.pause();
      this.usePowerupAnimation.hideAttachment();
    }
    this.idleSprite = visuals.idleSprite;
    this.jumpSprite = visuals.jumpSprite;
    this.crouchSprite = visuals.crouchSprite;
    this.walkAnimation = visuals.walkAnimation;
    this.usePowerupAnimation = visuals.usePowerupAnimation;
    if (this.currentVisual === "idle") {
      this.graphics.use(this.idleSprite);
    }
    if (this.currentVisual === "walk") {
      this.walkAnimation.reset();
      this.graphics.use(this.walkAnimation);
      this.walkAnimation.play();
    }
    if (this.currentVisual === "jump") {
      this.graphics.use(this.jumpSprite);
    }
    if (this.currentVisual === "crouch") {
      this.graphics.use(this.crouchSprite);
    }
    if (this.currentVisual === "usePowerup") {
      this.usePowerupAnimation.reset();
      this.graphics.use(this.usePowerupAnimation.graphic);
      this.usePowerupAnimation.play();
    }
    this.usePowerupAnimation.update(0, this.facingLeft);
  }

  private updatePowerupUseTimer(delta: number) {
    if (!this.isUsingPowerup) {
      this.usePowerupAnimation.hideAttachment();
      return;
    }
    this.usePowerupAnimation.update(delta, this.facingLeft);
    this.usePowerupTimeRemainingMs -= delta;
    if (this.usePowerupTimeRemainingMs > 0) {
      return;
    }
    this.stopUsingPowerup();
    this.sendPowerupUseState(false);
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

  private syncMovementPeriodically(delta: number, shouldBroadcastMovement = false) {
    if (!this.client) {
      return;
    }
    this.serverMovementSyncElapsedMs += delta;
    const syncIntervalMs = shouldBroadcastMovement
      ? serverKnockbackMovementSyncIntervalMs
      : serverMovementSyncIntervalMs;
    if (this.serverMovementSyncElapsedMs < syncIntervalMs) {
      return;
    }
    this.serverMovementSyncElapsedMs =
      this.serverMovementSyncElapsedMs % syncIntervalMs;
    const movementState = {
      ...this.currentMovementState(),
      isFlying: this.isFlying,
    };
    if (!this.shouldSyncMovementState(movementState)) {
      return;
    }
    this.lastServerMovementState = movementState;
    const payload = shouldBroadcastMovement ? movementState : {};
    const statePatch = shouldBroadcastMovement ? undefined : movementState;
    this.sendClient(messageTypes.updatePlayer, payload, statePatch);
  }

  private shouldSyncMovementState(movementState: Data) {
    const lastMovementState = this.lastServerMovementState;
    if (!lastMovementState) {
      return true;
    }
    if (
      Math.abs(Number(movementState.x) - Number(lastMovementState.x)) >=
      serverMovementPositionThreshold
    ) {
      return true;
    }
    if (
      Math.abs(Number(movementState.y) - Number(lastMovementState.y)) >=
      serverMovementPositionThreshold
    ) {
      return true;
    }
    if (
      Math.abs(
        Number(movementState.horizontalSpeed) -
          Number(lastMovementState.horizontalSpeed),
      ) >= serverMovementSpeedThreshold
    ) {
      return true;
    }
    if (
      Math.abs(
        Number(movementState.verticalSpeed) -
          Number(lastMovementState.verticalSpeed),
      ) >= serverMovementSpeedThreshold
    ) {
      return true;
    }
    return movementState.isFlying !== lastMovementState.isFlying;
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
    if (this.isUsingPowerup) {
      this.graphics.flipHorizontal = this.facingLeft;
      return;
    }
    const nextVisual: PlayerVisual = !this.isGrounded
      ? "jump"
      : this.keyDown && !this.isFlying
        ? "crouch"
        : keySign !== 0
          ? "walk"
          : "idle";
    if (nextVisual !== this.currentVisual) {
      if (this.currentVisual === "walk") {
        this.walkAnimation.pause();
      }
      this.currentVisual = nextVisual;
      if (nextVisual === "idle") {
        this.graphics.use(this.idleSprite);
      }
      if (nextVisual === "walk") {
        this.walkAnimation.reset();
        this.graphics.use(this.walkAnimation);
        this.walkAnimation.play();
      }
      if (nextVisual === "jump") {
        this.graphics.use(this.jumpSprite);
      }
      if (nextVisual === "crouch") {
        this.graphics.use(this.crouchSprite);
      }
    }
    this.graphics.flipHorizontal = this.facingLeft;
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
      keySign *
      walkSpeed *
      (this.isRunning ? runSpeedMultiplier : 1);
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

  override onPostUpdate(engine: ex.Engine, delta: number) {
    this.updateDamageFeedback(delta);
    if (this.isPaused) {
      this.updatePowerupUseTimer(delta);
      return;
    }
    this.updateControls(engine);

    const dt = delta / 1000;

    const keySign = this.inputState.horizontalSign();

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

    if (!isKnockbackActive && !this.isFlying && this.isGrounded && this.keyJump) {
      this.onJump();
    }
    if (!this.isFlying && !previousGrounded && this.isGrounded) {
      this.onLand();
    }

    this.syncPlayerVisuals(keySign);
    this.onMove();
    this.syncMovementPeriodically(delta, isKnockbackActive);
    this.updatePowerupUseTimer(delta);
  }
}
