import * as ex from "excalibur";
import { GameClient } from "../classes/GameClient";
import { TILE_PX } from "../world/worldConfig";
import { PlayerInputState } from "./PlayerInputState";
import { tileMeeting } from "./MovingActor";
import type { PlayerState } from "../classes/GameWire";
import type { TileCollisionWorld } from "./MovingActor";
import {
  LivingActor,
  type LivingSeparationKind,
  type LivingVitality,
} from "./LivingActor";
import {
  collisionOffsetForGraphicCenter,
  type WalkingTuning,
} from "./WalkingActor";
import type { LocomotionVisualsHost } from "./walking/LocomotionVisuals";
import {
  PlayerVisuals,
  type PlayerLocomotionVisual,
} from "./player/PlayerVisuals";
import {
  PlayerNetworkClient,
  type PlayerNetworkSnapshot,
} from "../classes/PlayerNetworkClient";
import { getHandAttackAnimation, type PlayerHand } from "../combat/playerHands";
import { Resources } from "../resource";

const runSpeedMultiplier = 2;
const jumpHoldDurationMs = 220;
const jumpHeldGravityMultiplier = 0.3;
const jumpReleasedGravityMultiplier = 1.15;
const jumpFallGravityMultiplier = 0.85;
const playerVitality: LivingVitality = {
  maxHealth: 6,
  damageImmunityDurationMs: 500,
  damageBlinkFrameMs: 90,
};
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

export class Player extends LivingActor {
  private client?: GameClient;
  isLocal: boolean = false;
  isPaused: boolean = false;
  private readonly inputState: PlayerInputState = new PlayerInputState();
  private readonly spawnPosition: ex.Vector;
  private lastAppliedRemoteAttackCycle: number = 0;
  private jumpHoldTimeRemainingMs: number = 0;
  private renderInterpolationOffset: ex.Vector = ex.vec(0, 0);
  private previousPhysicsPosition: ex.Vector;
  private currentPhysicsPosition: ex.Vector;
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
      collisionOffsetForGraphicCenter(ex.vec(TILE_PX / 2, TILE_PX / 2)),
      playerWalkingTuning,
      playerVitality,
      collisionWorld,
    );
    this.client = client;
    this.isLocal = client !== undefined;
    this.spawnPosition = ex.vec(pos.x, pos.y);
    this.previousPhysicsPosition = pos.clone();
    this.currentPhysicsPosition = pos.clone();

    this.visuals = new PlayerVisuals(this);
    this.playerNetwork = new PlayerNetworkClient(client);
    this.setEquippedWeaponSprite(Resources.WoodSword);
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

  public applyRemoteUpdate(payload: PlayerState): void {
    if (this.isLocal) {
      return;
    }
    if (payload.isPaused !== undefined) {
      this.setPaused(payload.isPaused);
    }
    if (payload.keyLeft !== undefined) {
      this.keyLeft = payload.keyLeft;
    }
    if (payload.keyRight !== undefined) {
      this.keyRight = payload.keyRight;
    }
    if (payload.keyJump !== undefined) {
      this.keyJump = payload.keyJump;
    }
    if (payload.keyDown !== undefined) {
      this.keyDown = payload.keyDown;
    }
    this.syncFacingFromNetwork(payload.facingLeft);
    if (payload.health !== undefined) {
      this.syncHealth(payload.health);
    }
    this.applyRemoteAttackFromPayload(payload);
    if (this.applyRemoteJumpStart(payload)) {
      return;
    }
    this.applyRemotePositionFromPayload(payload);
    this.applyRemoteVelocityFromPayload(payload);
  }

  private applyRemoteJumpStart(payload: PlayerState): boolean {
    if (payload.keyJump !== true || this.isJumping || !this.isGrounded) {
      return false;
    }
    const verticalSpeed = Number(payload.verticalSpeed);
    if (!Number.isFinite(verticalSpeed) || verticalSpeed >= 0) {
      return false;
    }
    if (payload.x === undefined || payload.y === undefined) {
      return false;
    }
    this.applySyncedNetworkPosition(
      { x: payload.x, y: payload.y },
      (position, snapDistance, correctionOptions) => {
        this.applyRemotePositionCorrection(
          position,
          snapDistance,
          correctionOptions,
        );
      },
      () => {
        this.syncPhysicsInterpolationToCurrentPosition();
      },
      {
        resetVelocity: false,
        forceHardSnap: true,
      },
    );
    this.applyRemoteVelocityFromPayload(payload);
    this.jumpHoldTimeRemainingMs = jumpHoldDurationMs;
    this.isGrounded = false;
    this.isJumping = true;
    this.syncLocomotionVisuals(this.inputState.horizontalSign());
    return true;
  }

  private applyRemoteVelocityFromPayload(payload: PlayerState): void {
    if (payload.horizontalSpeed !== undefined) {
      const horizontalSpeed = Number(payload.horizontalSpeed);
      if (Number.isFinite(horizontalSpeed)) {
        this.hspeed = horizontalSpeed;
      }
    }
    if (payload.verticalSpeed !== undefined) {
      const verticalSpeed = Number(payload.verticalSpeed);
      if (Number.isFinite(verticalSpeed)) {
        this.vspeed = verticalSpeed;
      }
    }
  }

  private applyRemotePositionFromPayload(payload: PlayerState): void {
    this.applySyncedNetworkPosition(
      { x: payload.x, y: payload.y },
      (position, snapDistance, correctionOptions) => {
        this.applyRemotePositionCorrection(
          position,
          snapDistance,
          correctionOptions,
        );
      },
      () => {
        this.syncPhysicsInterpolationToCurrentPosition();
      },
      { resetVelocity: false },
    );
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
    this.initializeLivingActor(engine);
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

  private useEquippedHand(hand: PlayerHand) {
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
    if (this.isGrounded) {
      if (this.vspeed > 0) {
        this.vspeed = 0;
      }
    } else {
      this.applyGravity(this.walkGravityForStep(deltaMs), dt);
    }
    this.moveWithVelocity(this.walkingTuning.positionScale, dt);
  }

  private tryAttack(hand: PlayerHand) {
    if (!this.client || this.isPaused) {
      return;
    }
    if (!this.triggerAttack(hand)) {
      return;
    }
    this.playerNetwork.onAttack(
      this.swordAttackCycle(),
      this.isFacingLeft(),
    );
  }

  private onJump() {
    if (!this.jump(this.walkingTuning.jumpSpeed)) {
      return;
    }
    this.jumpHoldTimeRemainingMs = jumpHoldDurationMs;
    const position = this.currentPosition();
    this.playerNetwork.onJump({
      x: position.x,
      y: position.y,
      horizontalSpeed: this.hspeed,
      verticalSpeed: this.vspeed,
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
    if (this.client) {
      this.syncPhysicsInterpolationToCurrentPosition();
      const position = this.currentPosition();
      this.playerNetwork.onLanded(position.x, position.y);
    }
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

  public applyRemotePositionCorrection(
    position: ex.Vector,
    snapDistance: number,
    options?: { forceHardSnap?: boolean },
  ) {
    if (this.isLocal) {
      return;
    }
    this.visuals.applyRemotePositionCorrection(position, snapDistance, options);
    this.syncPhysicsInterpolationToCurrentPosition();
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

  public syncPauseState(isPaused: boolean) {
    this.setPaused(isPaused);
    if (!this.client) {
      return;
    }
    const position = this.currentPosition();
    this.playerNetwork.onPaused({
      isPaused,
      x: position.x,
      y: position.y,
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
    this.clearKnockback();
    this.jumpHoldTimeRemainingMs = 0;
    this.syncPhysicsInterpolationToCurrentPosition();
  }

  private currentPosition() {
    return {
      x: syncedPositionValue(this.pos.x),
      y: syncedPositionValue(this.pos.y),
    };
  }

  private networkSnapshot(): PlayerNetworkSnapshot {
    const position = this.currentPosition();
    return {
      keyLeft: this.keyLeft,
      keyRight: this.keyRight,
      keyJump: this.keyJump,
      keyDown: this.keyDown,
      facingLeft: this.isFacingLeft(),
      isGrounded: this.isGrounded,
      x: position.x,
      y: position.y,
      horizontalSpeed: this.hspeed,
      verticalSpeed: this.vspeed,
      attackCycle: this.swordAttackCycle(),
    };
  }

  private syncLocalInputToNetwork(): void {
    if (!this.client || !this.inputState.hasChanged()) {
      return;
    }
    this.playerNetwork.onInputChanged(this.networkSnapshot());
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
    if (this.isKnockbackActive()) {
      this.stepKnockbackPhysics(delta);
    }
    if (!this.isKnockbackActive()) {
      this.moveWithWalkingGravity(dt, keySign, delta);
    }
    if (!this.isKnockbackActive() && this.isGrounded && this.keyJump) {
      this.onJump();
    }
    if (!this.isKnockbackActive() && wasJumping && this.isGrounded) {
      this.onWalkingLand();
    }
    this.syncLocomotionVisuals(keySign);
  }

  override onPostUpdate(engine: ex.Engine, delta: number) {
    const frameDelta = Math.min(delta, this.maxFrameDeltaMs);
    this.visuals.update(frameDelta);
    this.syncCollisionToSprite();
    if (!this.isPaused) {
      if (this.client) {
        this.updateControls(engine);
      }
      const keySign = this.inputState.horizontalSign();
      this.physicsAccumulatorMs += frameDelta;
      while (this.physicsAccumulatorMs >= this.fixedStepMs) {
        this.stepInterpolatedPlayerPhysics(keySign);
        this.physicsAccumulatorMs -= this.fixedStepMs;
      }
      if (this.client) {
        this.syncRenderInterpolation();
        this.syncLocalInputToNetwork();
        const position = this.currentPosition();
        this.playerNetwork.tickPositionBackup(
          frameDelta,
          position.x,
          position.y,
        );
      }
    }
    this.tickDamageFeedback(frameDelta);
  }
}
