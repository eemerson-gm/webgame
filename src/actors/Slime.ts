import * as ex from "excalibur";
import { TILE_PX } from "../world/worldConfig";
import {
  type LivingSeparationKind,
  type LivingVitality,
} from "./LivingActor";
import {
  WalkingActor,
  collisionOffsetForGraphicCenter,
  type WalkingTuning,
} from "./WalkingActor";
import type { TileCollisionWorld, WorldBounds } from "./MovingActor";
import { SlimeVisuals } from "./slime/SlimeVisuals";
import type { LocomotionVisualsHost } from "./walking/LocomotionVisuals";

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

const wanderDecisionMinMs = 1200;
const wanderDecisionMaxMs = 2000;

const randomWanderSign = () => {
  const choices = [-1, 0, 1] as const;
  return choices[Math.floor(Math.random() * choices.length)];
};

const randomWanderDelayMs = () =>
  wanderDecisionMinMs +
  Math.floor(Math.random() * (wanderDecisionMaxMs - wanderDecisionMinMs));

export class Slime extends WalkingActor {
  private readonly visuals: SlimeVisuals;
  private readonly slimeId: string;
  private readonly ownerId: string;
  private wanderSign: number = 0;
  private wanderDecisionElapsedMs: number = 0;
  private wanderDecisionDelayMs: number = randomWanderDelayMs();
  private isDead: boolean = false;

  constructor(
    entityId: string,
    ownerId: string,
    pos: ex.Vector,
    tilemap: ex.TileMap,
    collisionWorld: TileCollisionWorld,
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
    this.slimeId = entityId;
    this.ownerId = ownerId;
    this.visuals = new SlimeVisuals(this);
  }

  public entityId() {
    return this.slimeId;
  }

  public slimeOwnerId() {
    return this.ownerId;
  }

  public getWanderSign() {
    return this.wanderSign;
  }

  public setWanderSign(sign: number) {
    this.wanderSign = sign;
  }

  public setFacingLeft(facingLeft: boolean) {
    this.facingLeft = facingLeft;
    this.visuals.updateFacing(facingLeft);
  }

  public syncHealth(health: unknown) {
    this.syncLivingHealth(health);
    if (this.health <= 0) {
      this.die();
    }
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

  protected override onKnockbackApplied() {
    this.isGrounded = false;
    this.isJumping = true;
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
    return this.wanderSign;
  }

  protected tryJump() {
    if (this.isDead || this.wanderSign === 0) {
      return;
    }
    if (!this.shouldJumpForTileAhead(this.wanderSign)) {
      return;
    }
    this.startJump(this.walkingTuning.jumpSpeed);
  }

  public simulateJumpStart() {
    if (this.jump(this.walkingTuning.jumpSpeed)) {
      return;
    }
    this.vspeed = this.walkingTuning.jumpSpeed;
    this.isGrounded = false;
    this.isJumping = true;
  }

  public applyPositionCorrection(
    position: ex.Vector,
    snapDistance: number,
    options?: { forceHardSnap?: boolean },
  ) {
    this.visuals.applyRemotePositionCorrection(position, snapDistance, options);
  }

  protected onWanderChanged() {}

  override onInitialize(engine: ex.Engine) {
    this.visuals.initialize();
    this.syncCollisionToSprite();
    this.initializeLivingActor(engine);
  }

  public die() {
    if (this.isDead) {
      return;
    }
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

  private shouldJumpForTileAhead(moveSign: number) {
    if (!this.isGrounded) {
      return false;
    }
    if (this.entityTileMeeting(this.pos.x, this.pos.y - TILE_PX)) {
      return false;
    }
    const probeX = this.pos.x + moveSign * TILE_PX;
    return this.hasWallAhead(probeX);
  }

  private hasWallAhead(probeX: number) {
    if (!this.entityTileMeeting(probeX, this.pos.y)) {
      return false;
    }
    return !this.entityTileMeeting(probeX, this.pos.y - TILE_PX);
  }

  public tickWanderDecision(delta: number) {
    this.wanderDecisionElapsedMs += delta;
    if (this.wanderDecisionElapsedMs < this.wanderDecisionDelayMs) {
      return;
    }
    this.wanderDecisionElapsedMs = 0;
    this.wanderDecisionDelayMs = randomWanderDelayMs();
    const nextSign = randomWanderSign();
    if (nextSign === this.wanderSign) {
      return;
    }
    this.wanderSign = nextSign;
    if (nextSign < 0) {
      this.facingLeft = true;
    }
    if (nextSign > 0) {
      this.facingLeft = false;
    }
    this.visuals.updateFacing(this.facingLeft);
    this.onWanderChanged();
  }

  public isFacingLeft() {
    return this.facingLeft;
  }

  override onPostUpdate(_engine: ex.Engine, delta: number) {
    this.tickDamageFeedback(delta);
    if (this.isDead) {
      return;
    }
    this.tickWalkingFrame(delta);
  }
}
