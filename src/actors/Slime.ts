import * as ex from "excalibur";
import { TILE_PX } from "../world/worldConfig";
import {
  LivingActor,
  type LivingSeparationKind,
  type LivingVitality,
} from "./LivingActor";
import {
  collisionOffsetForGraphicCenter,
  type WalkingTuning,
} from "./WalkingActor";
import {
  entityCenterX,
  entityCenterY,
  horizontalSignBetween,
  tileMeeting,
  type EntityPhysicsOptions,
  type TileCollisionWorld,
  type WorldBounds,
} from "./MovingActor";
import { SlimeVisuals } from "./slime/SlimeVisuals";
import type { LocomotionVisualsHost } from "./walking/LocomotionVisuals";
import type { Player } from "./Player";

const slimeWalkingTuning: WalkingTuning = {
  walkSpeed: 0.55,
  walkAcceleration: 0.15,
  stopDeceleration: 0.14,
  turnAcceleration: 0.2,
  gravity: 0.2,
  jumpSpeed: -2.6,
  positionScale: 100,
};

const slimeVitality: LivingVitality = {
  maxHealth: 3,
  damageImmunityDurationMs: 500,
  damageBlinkFrameMs: 90,
};

const slimeKnockbackHorizontalSpeed = 1.6;
const slimeKnockbackVerticalSpeed = -1.2;

const followStopDistance = TILE_PX * 0.75;
const followJumpHorizontalDistance = TILE_PX * 2.5;
const followJumpVerticalOffset = TILE_PX * 0.5;

export class Slime extends LivingActor {
  private readonly visuals: SlimeVisuals;
  private readonly followTarget: Player;
  private isDead: boolean = false;

  constructor(
    pos: ex.Vector,
    tilemap: ex.TileMap,
    collisionWorld: TileCollisionWorld,
    followTarget: Player,
  ) {
    const width = TILE_PX;
    const height = TILE_PX;
    super(
      pos,
      tilemap,
      ex.vec(width, height),
      collisionOffsetForGraphicCenter(ex.vec(TILE_PX / 2, TILE_PX / 2)),
      slimeWalkingTuning,
      slimeVitality,
      collisionWorld,
    );
    this.followTarget = followTarget;
    this.visuals = new SlimeVisuals(this);
  }

  public entityId() {
    return "slime:test";
  }

  protected separationKind(): LivingSeparationKind {
    return "entity";
  }

  protected isLivingActive() {
    return !this.isDead;
  }

  protected separationDimensions() {
    if (!this.isAlive()) {
      return { width: 0, height: 0 };
    }
    return {
      width: this.collisionBounds.width,
      height: this.collisionBounds.height,
    };
  }

  public contactDamage() {
    return 0;
  }

  public overlapsWorldBounds(bounds: WorldBounds) {
    return super.overlapsWorldBounds(bounds);
  }

  public knockBackFromFacing(facingLeft: boolean) {
    const direction = facingLeft ? -1 : 1;
    this.hspeed = slimeKnockbackHorizontalSpeed * direction;
    this.vspeed = slimeKnockbackVerticalSpeed;
    this.isGrounded = false;
    this.isJumping = true;
  }

  public knockBackFrom(player: Player) {
    this.knockBackFromFacing(player.isFacingLeft());
  }

  public takeDamageFrom(player: Player, damage: number = 1) {
    if (!this.canTakeDamage()) {
      return false;
    }
    const depleted = this.applyDamage(damage);
    if (depleted) {
      return true;
    }
    this.knockBackFromFacing(player.isFacingLeft());
    return true;
  }

  protected onHealthDepleted() {
    this.die();
  }

  protected locomotionVisuals(): LocomotionVisualsHost {
    return this.visuals;
  }

  protected horizontalMoveSign() {
    if (this.isDead) {
      return 0;
    }
    return this.followMoveSign();
  }

  protected tryJump() {
    if (!this.shouldFollowJump()) {
      return;
    }
    this.jump(this.walkingTuning.jumpSpeed);
  }

  override onInitialize(engine: ex.Engine) {
    this.visuals.initialize();
    this.syncCollisionToSprite();
    this.initializeLivingActor(engine);
  }

  private die() {
    this.isDead = true;
    this.health = 0;
    this.hspeed = 0;
    this.vspeed = 0;
    this.graphics.opacity = 0;
    this.graphics.visible = false;
    this.collisionBounds.width = 0;
    this.collisionBounds.height = 0;
    this.pos = ex.vec(-100_000, -100_000);
    this.kill();
  }

  private followMoveSign() {
    if (this.followTarget.isPaused) {
      return 0;
    }
    const targetX = entityCenterX({
      x: this.followTarget.pos.x,
      width: this.followTarget.width,
    });
    const horizontalDistance = Math.abs(this.centerX() - targetX);
    if (horizontalDistance <= followStopDistance) {
      return 0;
    }
    return horizontalSignBetween(
      { x: this.pos.x, width: this.width },
      { x: this.followTarget.pos.x, width: this.followTarget.width },
    );
  }

  private shouldFollowJump() {
    if (!this.isGrounded) {
      return false;
    }
    if (this.followTarget.isPaused) {
      return false;
    }
    const moveSign = this.followMoveSign();
    if (moveSign === 0) {
      return false;
    }
    const physicsOptions = this.followPhysicsOptions();
    if (this.shouldJumpForTileAhead(moveSign, physicsOptions)) {
      return true;
    }
    const targetX = entityCenterX({
      x: this.followTarget.pos.x,
      width: this.followTarget.width,
    });
    const targetY = entityCenterY({
      y: this.followTarget.pos.y,
      height: this.followTarget.height,
    });
    const horizontalDistance = Math.abs(this.centerX() - targetX);
    if (horizontalDistance > followJumpHorizontalDistance) {
      return false;
    }
    return targetY < this.centerY() - followJumpVerticalOffset;
  }

  private followPhysicsOptions(): EntityPhysicsOptions {
    return {
      collisionBounds: this.collisionBounds,
      world: this.tileCollisionWorld(),
    };
  }

  private shouldJumpForTileAhead(
    moveSign: number,
    physicsOptions: EntityPhysicsOptions,
  ) {
    const probeX = this.pos.x + moveSign * TILE_PX;
    if (tileMeeting(this.pos.x, this.pos.y - TILE_PX, physicsOptions)) {
      return false;
    }
    return this.hasWallAhead(probeX, physicsOptions);
  }

  private hasWallAhead(probeX: number, physicsOptions: EntityPhysicsOptions) {
    if (!tileMeeting(probeX, this.pos.y, physicsOptions)) {
      return false;
    }
    return !tileMeeting(probeX, this.pos.y - TILE_PX, physicsOptions);
  }

  override onPostUpdate(_engine: ex.Engine, delta: number) {
    this.tickDamageFeedback(delta);
    if (this.isDead) {
      return;
    }
    this.tickWalkingFrame(delta);
  }
}
