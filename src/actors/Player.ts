import * as ex from "excalibur";
import { GameClient } from "../classes/GameClient";
import { TILE_PX } from "../world/worldConfig";
import { PlayerInputState } from "./PlayerInputState";
import { tileMeeting } from "./MovingActor";
import type { PlayerState } from "../classes/GameProtocol";
import type { EntitySeparationBody, TileCollisionWorld } from "./MovingActor";
import {
  WalkingActor,
  collisionOffsetForGraphicCenter,
  type WalkingTuning,
} from "./WalkingActor";
import type { LocomotionVisualsHost } from "./walking/LocomotionVisuals";
import { DamageFlash } from "./DamageableActor";
import { PlayerVisuals, type PlayerLocomotionVisual } from "./player/PlayerVisuals";
import { PlayerNetworkClient } from "../classes/PlayerNetworkClient";
import {
  createStarterInventory,
  PlayerInventory,
} from "../inventory/PlayerInventory";
import {
  getItemCategory,
  isHandCategory,
  type EquipmentSlot,
} from "../items/itemDefinitions";
import { Resources } from "../resource";

const runSpeedMultiplier = 2;
const jumpHoldDurationMs = 220;
const jumpHeldGravityMultiplier = 0.3;
const jumpReleasedGravityMultiplier = 1.15;
const jumpFallGravityMultiplier = 0.85;
const playerKnockbackHorizontalSpeed = 2.2;
const playerKnockbackVerticalSpeed = -1.4;
const playerKnockbackDurationMs = 240;
const playerKnockbackFriction = 0.94;
const playerMaxHealth = 6;
const playerDamageImmunityDurationMs = 500;
const playerDamageBlinkFrameMs = 90;
const positionPrecision = 1000;
const cameraFollowResponsiveness = 10;
const cameraSnapDistance = TILE_PX * 8;
const cameraPixelSnapScale = 3;

const playerWalkingTuning: WalkingTuning = {
  walkSpeed: 1.2,
  walkAcceleration: 0.25,
  stopDeceleration: 0.22,
  turnAcceleration: 0.32,
  gravity: 0.2,
  jumpSpeed: -2.8,
  positionScale: 100,
};

const syncedPositionValue = (value: number) =>
  Math.round(value * positionPrecision) / positionPrecision;

const snappedCameraFocus = (focus: ex.Vector) =>
  ex.vec(
    Math.round(focus.x * cameraPixelSnapScale) / cameraPixelSnapScale,
    Math.round(focus.y * cameraPixelSnapScale) / cameraPixelSnapScale,
  );

type CameraFocusTarget = {
  cameraFocusPosition: () => ex.Vector;
};

class SmoothCameraFollowStrategy {
  constructor(
    public readonly target: CameraFocusTarget,
    private readonly responsiveness: number,
    private readonly snapDistance: number,
  ) {}

  public readonly action = (
    target: CameraFocusTarget,
    camera: ex.Camera,
    _engine: ex.Engine,
    elapsed: number,
  ): ex.Vector => {
    const currentFocus = camera.getFocus();
    const targetFocus = target.cameraFocusPosition();
    if (currentFocus.distance(targetFocus) >= this.snapDistance) {
      return snappedCameraFocus(targetFocus);
    }
    const blend =
      1 - Math.exp((-this.responsiveness * Math.max(elapsed, 0)) / 1000);
    return snappedCameraFocus(
      currentFocus.add(targetFocus.sub(currentFocus).scale(blend)),
    );
  };
}

export class Player extends WalkingActor {
  private client?: GameClient;
  isLocal: boolean = false;
  isPaused: boolean = false;
  public health: number = playerMaxHealth;
  public readonly maxHealth: number = playerMaxHealth;
  private readonly inputState: PlayerInputState = new PlayerInputState();
  private readonly spawnPosition: ex.Vector;
  private damageFlash: DamageFlash;
  private knockbackTimeRemainingMs: number = 0;
  private lastAppliedRemoteAttackCycle: number = 0;
  private damageImmunityTimeRemainingMs: number = 0;
  private jumpHoldTimeRemainingMs: number = 0;
  private renderInterpolationOffset: ex.Vector = ex.vec(0, 0);
  private previousPhysicsPosition: ex.Vector;
  private currentPhysicsPosition: ex.Vector;

  private visuals: PlayerVisuals;
  private playerNetwork: PlayerNetworkClient;

  public readonly inventory: PlayerInventory;

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
      collisionOffsetForGraphicCenter(ex.vec(TILE_PX / 2, TILE_PX / 2)),
      playerWalkingTuning,
      collisionWorld,
    );
    this.client = client;
    this.isLocal = client !== undefined;
    this.spawnPosition = ex.vec(pos.x, pos.y);
    this.previousPhysicsPosition = pos.clone();
    this.currentPhysicsPosition = pos.clone();

    this.visuals = new PlayerVisuals(this);
    this.playerNetwork = new PlayerNetworkClient(client);
    this.inventory = new PlayerInventory();

    this.damageFlash = new DamageFlash(this, {
      durationMs: playerDamageImmunityDurationMs,
      blinkFrameMs: playerDamageBlinkFrameMs,
    });
  }

  public triggerAttack(hand: EquipmentSlot) {
    if (this.isPaused) {
      return false;
    }
    const itemId = this.inventory.getEquipped(hand);
    if (itemId === null) {
      return false;
    }
    const category = getItemCategory(itemId);
    if (category === undefined || !isHandCategory(category)) {
      return false;
    }
    return this.visuals.playHandAttack(category);
  }

  public applyStarterInventory() {
    this.inventory.setFromState(createStarterInventory().toState());
    this.applyEquippedVisuals();
    this.syncInventoryState();
  }

  public syncInventoryFromPayload(payload: PlayerState) {
    this.inventory.setFromPlayerState(payload);
    this.applyEquippedVisuals();
  }

  public syncInventoryState() {
    this.applyEquippedVisuals();
    if (!this.client) {
      return;
    }
    this.playerNetwork.sendUpdate(this.inventory.toState());
  }

  public applyEquippedVisuals() {
    const leftItemId = this.inventory.getEquipped("handLeft");
    const category = leftItemId ? getItemCategory(leftItemId) : undefined;
    if (category === "pickaxe") {
      this.setEquippedWeaponSprite(Resources.BronzePickaxe);
      return;
    }
    this.setEquippedWeaponSprite(Resources.WoodSword);
  }

  public syncFacingFromKeys() {
    const moveSign = this.inputState.horizontalSign();
    if (moveSign === 0) {
      return;
    }
    this.syncFacingFromHorizontalSign(moveSign);
    this.visuals.updateFacing(this.facingLeft);
  }

  public syncFacingFromNetwork(facingLeft: boolean | undefined) {
    if (facingLeft !== undefined) {
      this.facingLeft = facingLeft;
      this.visuals.updateFacing(facingLeft);
      return;
    }
    this.syncFacingFromKeys();
  }

  public applyRemoteAttackFromPayload(payload: PlayerState) {
    this.syncFacingFromNetwork(payload.facingLeft);
    const attackCycle = Number(payload.attackCycle);
    if (Number.isFinite(attackCycle) && attackCycle > 0) {
      if (attackCycle > this.lastAppliedRemoteAttackCycle) {
        this.lastAppliedRemoteAttackCycle = attackCycle;
        if (this.isSwordAttackActive()) {
          this.visuals.endSwordAttackForResync();
        }
        this.triggerAttack("handLeft");
        return;
      }
    }
    if (payload.keyAttack) {
      this.triggerAttack("handLeft");
    }
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
      this.scene.camera.addStrategy(
        new SmoothCameraFollowStrategy(
          this,
          cameraFollowResponsiveness,
          cameraSnapDistance,
        ),
      );
      this.scene.camera.strategy.limitCameraBounds(worldBounds);
      engine.input.pointers.primary.on("down", (evt) => {
        if (evt.button === ex.PointerButton.Right) {
          this.useEquippedHand("handRight");
          return;
        }
        if (evt.button === ex.PointerButton.Left) {
          this.useEquippedHand("handLeft");
        }
      });
      engine.canvas.addEventListener("contextmenu", (event) => {
        event.preventDefault();
      });
    }
  }

  private useEquippedHand(hand: EquipmentSlot) {
    if (!this.client || this.isPaused) {
      return;
    }
    this.tryAttack(hand);
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
    this.applyGravity(this.walkGravityForStep(deltaMs), dt);
    this.moveWithVelocity(this.walkingTuning.positionScale, dt);
  }

  private tryAttack(hand: EquipmentSlot) {
    if (!this.client || this.isPaused) {
      return;
    }
    if (!this.triggerAttack(hand)) {
      return;
    }
    this.playerNetwork.sendUpdate({
      keyAttack: true,
      attackCycle: this.swordAttackCycle(),
      facingLeft: this.isFacingLeft(),
    });
  }

  private onJump() {
    if (!this.jump(this.walkingTuning.jumpSpeed)) {
      return;
    }
    this.jumpHoldTimeRemainingMs = jumpHoldDurationMs;
    this.playerNetwork.sendUpdate({
      keyJump: true,
    });
  }

  private snapToGroundPixel() {
    const groundedY =
      [Math.ceil(this.pos.y), Math.round(this.pos.y), Math.floor(this.pos.y)]
        .filter((y, index, values) => values.indexOf(y) === index)
        .find((y) => this.canStandAtY(y) && this.isGroundedAtY(y)) ??
      this.pos.y;
    if (groundedY === this.pos.y) {
      return;
    }
    this.pos.y = groundedY;
  }

  private canStandAtY(y: number) {
    return !tileMeeting(this.pos.x, y, {
      collisionBounds: this.collisionBounds,
      world: this.tileCollisionWorld(),
    });
  }

  private isGroundedAtY(y: number) {
    return tileMeeting(this.pos.x, y + 1, {
      collisionBounds: this.collisionBounds,
      world: this.tileCollisionWorld(),
    });
  }

  protected override onWalkingLand() {
    this.jumpHoldTimeRemainingMs = 0;
    this.snapToGroundPixel();
    this.syncPosition();
  }

  public setEquippedWeaponSprite(sprite: ex.ImageSource) {
    this.visuals.setEquippedWeaponSprite(sprite);
  }

  public knockBackFromFacing(facingLeft: boolean) {
    if (this.isPaused) {
      return;
    }
    const direction = facingLeft ? -1 : 1;
    this.hspeed = playerKnockbackHorizontalSpeed * direction;
    this.vspeed = playerKnockbackVerticalSpeed;
    this.knockbackTimeRemainingMs = playerKnockbackDurationMs;
    this.jumpHoldTimeRemainingMs = 0;
    const movementState = {
      ...this.currentMovementState(),
    };
    this.playerNetwork.sendUpdate(movementState);
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
    if (actor instanceof Player) {
      this.knockBackFromFacing(actor.isFacingLeft());
    }
    if (!(actor instanceof Player)) {
      this.knockBackFrom(actor);
    }
    this.syncHealthState();
    return true;
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

  public combatCollisionBounds() {
    return this.collisionBounds;
  }

  public canReceiveWeaponDamage() {
    return this.canTakeDamage();
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
    this.syncPhysicsInterpolationToCurrentPosition();
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
    this.syncPhysicsInterpolationToCurrentPosition();
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
    this.syncPhysicsInterpolationToCurrentPosition();
    this.syncHealthState();
  }

  public cameraFocusPosition() {
    return this.pos
      .add(this.renderInterpolationOffset)
      .add(ex.vec(this.width / 2, this.height / 2));
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
    this.syncPhysicsInterpolationToCurrentPosition();
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
      attackCycle: this.swordAttackCycle(),
      facingLeft: this.isFacingLeft(),
      keyLeft: this.keyLeft,
      keyRight: this.keyRight,
      keyJump: this.keyJump,
      keyDown: this.keyDown,
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
    const shouldSyncPosition = this.inputState.shouldSyncPosition(
      this.isGrounded,
    );
    const movementState = shouldSyncPosition ? this.currentMovementState() : {};
    const payload = this.inputState.payload(movementState);
    const statePatch = this.inputState.statePatch(shouldSyncPosition, payload);
    this.playerNetwork.sendUpdate(
      payload,
      statePatch === payload ? undefined : statePatch,
    );
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
    this.applyGravity(this.walkingTuning.gravity, dt);
    this.moveWithVelocity(this.walkingTuning.positionScale, dt);
    this.hspeed *= playerKnockbackFriction;
  }

  private updateDamageFeedback(delta: number) {
    this.damageImmunityTimeRemainingMs = Math.max(
      this.damageImmunityTimeRemainingMs - delta,
      0,
    );
    this.damageFlash.tick(delta);
  }

  private syncPhysicsInterpolationToCurrentPosition() {
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
    const wasJumping = this.isJumping;
    const isKnockbackActive = this.knockbackTimeRemainingMs > 0;
    if (isKnockbackActive) {
      this.moveWithKnockback(delta, dt);
    }
    if (!isKnockbackActive) {
      this.moveWithWalkingGravity(dt, keySign, delta);
    }
    if (!isKnockbackActive && this.isGrounded && this.keyJump) {
      this.onJump();
    }
    if (!isKnockbackActive && wasJumping && this.isGrounded) {
      this.onWalkingLand();
    }
    this.syncLocomotionVisuals(keySign);
    this.playerNetwork.syncMovementPeriodically(
      delta,
      {
        ...this.currentMovementState(),
      },
      isKnockbackActive,
    );
  }

  override onPostUpdate(engine: ex.Engine, delta: number) {
    const frameDelta = Math.min(delta, this.maxFrameDeltaMs);
    this.visuals.updateVisualCorrection(frameDelta);
    this.syncCollisionToSprite();
    if (!this.isPaused) {
      this.updateControls(engine);
      const keySign = this.inputState.horizontalSign();
      this.physicsAccumulatorMs += frameDelta;
      while (this.physicsAccumulatorMs >= this.fixedStepMs) {
        this.stepInterpolatedPlayerPhysics(keySign);
        this.physicsAccumulatorMs -= this.fixedStepMs;
      }
      this.syncRenderInterpolation();
      this.onMove();
    }
    this.updateDamageFeedback(frameDelta);
  }
}
