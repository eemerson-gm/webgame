import * as ex from "excalibur";
import { TILE_PX } from "../world/worldConfig";
import type { GameClient } from "../classes/GameClient";
import {
  SlimeNetworkClient,
  type SlimeWanderSnapshot,
} from "../classes/SlimeNetworkClient";
import type { EntityState } from "../classes/GameWire";
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
  moveHorizontallyUntilBlocked,
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

const wanderDecisionMinMs = 1200;
const wanderDecisionMaxMs = 2000;
const remotePlayerPositionTolerance = 0.5;
const remotePlayerSnapDistance = TILE_PX * 2;
const maxGroundedNetworkSnapUpPx = 1;
const positionPrecision = 1000;

const syncedPositionValue = (value: number) =>
  Math.round(value * positionPrecision) / positionPrecision;

const randomWanderSign = () => {
  const choices = [-1, 0, 1] as const;
  return choices[Math.floor(Math.random() * choices.length)];
};

const randomWanderDelayMs = () =>
  wanderDecisionMinMs +
  Math.floor(Math.random() * (wanderDecisionMaxMs - wanderDecisionMinMs));

export class Slime extends LivingActor {
  private readonly visuals: SlimeVisuals;
  private readonly slimeId: string;
  private readonly ownerId: string;
  private readonly isAuthority: boolean;
  private readonly slimeNetwork: SlimeNetworkClient | null;
  private wanderSign: number = 0;
  private wanderDecisionElapsedMs: number = 0;
  private wanderDecisionDelayMs: number = randomWanderDelayMs();
  private isDead: boolean = false;

  constructor(
    entityId: string,
    ownerId: string,
    myPlayerId: string,
    pos: ex.Vector,
    tilemap: ex.TileMap,
    collisionWorld: TileCollisionWorld,
    client?: GameClient,
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
    this.isAuthority = client !== undefined && ownerId === myPlayerId;
    this.slimeNetwork =
      this.isAuthority && client
        ? new SlimeNetworkClient(client, entityId)
        : null;
    this.visuals = new SlimeVisuals(this);
  }

  public entityId() {
    return this.slimeId;
  }

  public slimeOwnerId() {
    return this.ownerId;
  }

  public hasAuthority() {
    return this.isAuthority;
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
    void player;
    void damage;
    return false;
  }

  public applyRemoteUpdate(payload: EntityState): void {
    if (this.isAuthority) {
      return;
    }
    if (payload.wanderSign !== undefined) {
      this.wanderSign = payload.wanderSign;
    }
    if (payload.facingLeft !== undefined) {
      this.facingLeft = payload.facingLeft;
      this.visuals.updateFacing(payload.facingLeft);
    }
    if (payload.health !== undefined) {
      this.health = payload.health;
      if (this.health <= 0) {
        this.die();
        return;
      }
    }
    if (payload.jump === true && this.isGrounded && !this.isJumping) {
      this.jump(this.walkingTuning.jumpSpeed);
    }
    this.applyRemotePositionFromPayload(payload);
  }

  private applyRemotePositionFromPayload(payload: EntityState): void {
    const hasX = payload.x !== undefined;
    const hasY = payload.y !== undefined;
    if (!hasX && !hasY) {
      return;
    }
    const nextX = hasX ? Number(payload.x) : this.pos.x;
    const nextY = hasY ? Number(payload.y) : this.pos.y;
    if (!Number.isFinite(nextX) || !Number.isFinite(nextY)) {
      return;
    }
    const syncPosition = ex.vec(
      nextX,
      hasY && this.shouldApplyNetworkY(nextY) ? nextY : this.pos.y,
    );
    if (this.pos.distance(syncPosition) < remotePlayerPositionTolerance) {
      return;
    }
    this.visuals.applyRemotePositionCorrection(
      syncPosition,
      remotePlayerSnapDistance,
    );
  }

  /**
   * Peers simulate jump arcs locally. Network Y is only for grounded drift and
   * landing — never while airborne (floor teleport) or large upward snaps
   * (use jump event + physics instead).
   */
  private shouldApplyNetworkY(nextY: number): boolean {
    if (this.isJumping || !this.isGrounded) {
      return false;
    }
    const deltaY = nextY - this.pos.y;
    if (deltaY > maxGroundedNetworkSnapUpPx) {
      return false;
    }
    return Math.abs(deltaY) <= TILE_PX;
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
    if (!this.isAuthority || this.isDead || this.wanderSign === 0) {
      return;
    }
    const physicsOptions = this.followPhysicsOptions();
    if (!this.shouldJumpForTileAhead(this.wanderSign, physicsOptions)) {
      return;
    }
    if (!this.jump(this.walkingTuning.jumpSpeed)) {
      return;
    }
    this.slimeNetwork?.onJump();
  }

  protected override onWalkingLand() {
    super.onWalkingLand();
    if (!this.isAuthority) {
      return;
    }
    const position = this.currentPosition();
    this.slimeNetwork?.onLanded(position.x, position.y);
  }

  override onInitialize(engine: ex.Engine) {
    this.visuals.initialize();
    this.syncCollisionToSprite();
    this.initializeLivingActor(engine);
  }

  private die() {
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
    if (!this.isGrounded || !this.isHorizontallyBlocked(moveSign, physicsOptions)) {
      return false;
    }
    if (tileMeeting(this.pos.x, this.pos.y - TILE_PX, physicsOptions)) {
      return false;
    }
    const probeX = this.pos.x + moveSign * TILE_PX;
    return !tileMeeting(probeX, this.pos.y - TILE_PX, physicsOptions);
  }

  private isHorizontallyBlocked(
    moveSign: number,
    physicsOptions: EntityPhysicsOptions,
  ) {
    return moveHorizontallyUntilBlocked(
      this.pos.x,
      this.pos.y,
      moveSign,
      physicsOptions,
    ).isBlocked;
  }

  private currentPosition() {
    return {
      x: syncedPositionValue(this.pos.x),
      y: syncedPositionValue(this.pos.y),
    };
  }

  private wanderSnapshot(): SlimeWanderSnapshot {
    const position = this.currentPosition();
    return {
      wanderSign: this.wanderSign,
      facingLeft: this.facingLeft,
      isGrounded: this.isGrounded,
      x: position.x,
      y: position.y,
    };
  }

  private tickWanderDecision(delta: number) {
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
    this.slimeNetwork?.onWanderChanged(this.wanderSnapshot());
  }

  override onPostUpdate(_engine: ex.Engine, delta: number) {
    this.tickDamageFeedback(delta);
    if (this.isDead) {
      return;
    }
    this.tickWalkingFrame(delta);
    if (this.isAuthority) {
      this.tickWanderDecision(delta);
      const position = this.currentPosition();
      this.slimeNetwork?.tickPositionBackup(delta, position.x, position.y);
    }
  }
}
