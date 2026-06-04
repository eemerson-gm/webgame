import * as ex from "excalibur";
import { TILE_PX } from "../world/worldConfig";
import { PlayerInputState } from "./PlayerInputState";
import type { TileCollisionWorld } from "./MovingActor";
import { type LivingSeparationKind } from "./LivingActor";
import {
  WalkingActor,
  collisionOffsetForGraphicCenter,
} from "./WalkingActor";
import type { LocomotionVisualsHost } from "./walking/LocomotionVisuals";
import {
  PlayerVisuals,
  type PlayerLocomotionVisual,
} from "./player/PlayerVisuals";
import { getHandAttackAnimation, type PlayerHand } from "../combat/playerHands";
import { Resources } from "../resource";
import { NetworkedEntityState } from "../game/sim/NetworkedEntityState";
import { PlayerLocomotionSimulator } from "../game/sim/locomotion/PlayerLocomotionSimulator";
import {
  playerJumpHoldDurationMs,
  playerVitality,
  playerWalkingTuning,
} from "../game/sim/simConfig";

const runSpeedMultiplier = 2;
export { playerJumpHoldDurationMs };

export class Player extends WalkingActor {
  isPaused: boolean = false;
  private readonly inputState: PlayerInputState = new PlayerInputState();
  private readonly spawnPosition: ex.Vector;
  private readonly simState = new NetworkedEntityState();
  private readonly locomotion = new PlayerLocomotionSimulator(
    this.simState,
    playerWalkingTuning,
  );
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
    if (!this.visuals.playHandAttack(getHandAttackAnimation(hand))) {
      return false;
    }
    this.onAttackStarted(hand);
    return true;
  }

  protected onAttackStarted(_hand: PlayerHand) {
    void _hand;
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

  protected override syncCollisionToSprite() {
    void 0;
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

  protected override moveWithWalkingGravity(
    dt: number,
    moveSign: number,
    deltaMs: number,
  ) {
    void dt;
    this.syncSimStateFromActor();
    this.locomotion.stepLocomotion(
      moveSign,
      deltaMs,
      {
        collisionBounds: this.collisionBounds,
        world: this.tileCollisionWorld(),
        dt: deltaMs / 1000,
        positionScale: this.walkingTuning.positionScale,
      },
      {
        keyJump: this.keyJump,
        isRunning: this.isRunning,
        runSpeedMultiplier,
      },
    );
    this.syncActorFromSimState();
  }

  protected onJump() {
    this.syncSimStateFromActor();
    if (!this.locomotion.tryJump()) {
      return;
    }
    this.syncActorFromSimState();
  }

  protected override onLand() {
    this.locomotion.jumpHoldTimeRemainingMs = 0;
  }

  public setEquippedWeaponSprite(sprite: ex.ImageSource) {
    this.visuals.setEquippedWeaponSprite(sprite);
  }

  protected override canReceiveKnockback() {
    return !this.isPaused && super.canReceiveKnockback();
  }

  protected override onKnockbackApplied() {
    this.locomotion.jumpHoldTimeRemainingMs = 0;
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
    this.locomotion.jumpHoldTimeRemainingMs = durationMs;
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
    this.locomotion.jumpHoldTimeRemainingMs = 0;
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
    this.locomotion.jumpHoldTimeRemainingMs = 0;
    this.syncPhysicsInterpolationToCurrentPosition();
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

  protected shouldRunLocalPhysics(): boolean {
    return true;
  }

  public applyInputSample(sample: {
    keyLeft: boolean;
    keyRight: boolean;
    keyJump: boolean;
    keyDown: boolean;
    facingLeft?: boolean;
  }) {
    this.keyLeft = sample.keyLeft;
    this.keyRight = sample.keyRight;
    this.keyJump = sample.keyJump;
    this.keyDown = sample.keyDown;
    if (sample.keyLeft !== sample.keyRight) {
      this.facingLeft = sample.keyLeft;
      return;
    }
    if (sample.facingLeft !== undefined) {
      this.facingLeft = sample.facingLeft;
    }
  }

  private syncSimStateFromActor() {
    this.simState.apply({
      x: this.pos.x,
      y: this.pos.y,
      horizontalSpeed: this.hspeed,
      verticalSpeed: this.vspeed,
      width: this.width,
      height: this.height,
      isGrounded: this.isGrounded,
      isJumping: this.isJumping,
    });
  }

  private syncActorFromSimState() {
    this.pos.x = this.simState.x;
    this.pos.y = this.simState.y;
    this.hspeed = this.simState.horizontalSpeed;
    this.vspeed = this.simState.verticalSpeed;
    this.isGrounded = this.simState.isGrounded;
    this.isJumping = this.simState.isJumping;
  }

  protected stepPlayerPhysics(keySign: number, delta: number) {
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
    if (this.shouldRunLocalPhysics() && !this.isPaused) {
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
