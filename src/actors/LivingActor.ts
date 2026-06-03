import * as ex from "excalibur";
import { DamageFlash } from "./DamageableActor";
import {
  remotePositionSnapDistancePx,
  remotePositionTolerancePx,
} from "./RemoteNetworkSync";
import type {
  CollisionBounds,
  EntitySeparationBody,
  TileCollisionWorld,
} from "./MovingActor";
import { PHYSICS_REFERENCE_HZ } from "../world/physicsConfig";
import { WalkingActor, type WalkingTuning } from "./WalkingActor";

export type LivingVitality = {
  maxHealth: number;
  damageImmunityDurationMs: number;
  damageBlinkFrameMs: number;
};

export type LivingKnockback = {
  horizontalSpeed: number;
  verticalSpeed: number;
  durationMs: number;
  friction: number;
};

export const defaultLivingKnockback: LivingKnockback = {
  horizontalSpeed: 2.2,
  verticalSpeed: -1.4,
  durationMs: 240,
  friction: 0.94,
};

export type LivingSeparationKind = "player" | "entity";

export abstract class LivingActor extends WalkingActor {
  public health: number;
  public readonly maxHealth: number;
  protected damageImmunityTimeRemainingMs: number = 0;
  private knockbackTimeRemainingMs: number = 0;
  private readonly damageImmunityDurationMs: number;
  private readonly knockback: LivingKnockback;
  private readonly damageFlash: DamageFlash;

  constructor(
    pos: ex.Vector,
    tilemap: ex.TileMap,
    size: ex.Vector,
    collisionBounds: CollisionBounds,
    tuning: WalkingTuning,
    vitality: LivingVitality,
    collisionWorld?: TileCollisionWorld,
    knockback: LivingKnockback = defaultLivingKnockback,
  ) {
    super(pos, tilemap, size, collisionBounds, tuning, collisionWorld);
    this.maxHealth = vitality.maxHealth;
    this.health = vitality.maxHealth;
    this.damageImmunityDurationMs = vitality.damageImmunityDurationMs;
    this.knockback = knockback;
    this.damageFlash = new DamageFlash(this, {
      durationMs: vitality.damageImmunityDurationMs,
      blinkFrameMs: vitality.damageBlinkFrameMs,
    });
  }

  protected initializeLivingActor(engine: ex.Engine) {
    this.damageFlash.initialize(engine);
  }

  protected tickDamageFeedback(delta: number) {
    this.damageImmunityTimeRemainingMs = Math.max(
      this.damageImmunityTimeRemainingMs - delta,
      0,
    );
    this.knockbackTimeRemainingMs = Math.max(
      this.knockbackTimeRemainingMs - delta,
      0,
    );
    this.damageFlash.tick(delta);
  }

  public hurtCollisionBounds() {
    return this.collisionBounds;
  }

  public isAlive() {
    return this.health > 0 && this.isLivingActive();
  }

  protected isLivingActive() {
    return true;
  }

  public canReceiveWeaponDamage() {
    return this.canTakeDamage();
  }

  protected canTakeDamage() {
    if (!this.isLivingActive()) {
      return false;
    }
    if (this.damageImmunityTimeRemainingMs > 0) {
      return false;
    }
    return this.health > 0;
  }

  protected canReceiveKnockback() {
    return this.isLivingActive();
  }

  protected override isKnockbackActive() {
    return this.knockbackTimeRemainingMs > 0;
  }

  protected override stepKnockbackPhysics(delta: number) {
    const dt = delta / 1000;
    this.applyGravity(this.walkingTuning.gravity, dt);
    this.moveWithVelocity(this.walkingTuning.positionScale, dt);
    const stepsAtReferenceRate = delta / (1000 / PHYSICS_REFERENCE_HZ);
    this.hspeed *= Math.pow(this.knockback.friction, stepsAtReferenceRate);
  }

  public knockBackFromFacing(facingLeft: boolean) {
    if (!this.canReceiveKnockback()) {
      return;
    }
    const direction = facingLeft ? -1 : 1;
    this.applyKnockbackImpulse(direction);
  }

  public knockBackFromAttacker(attacker: ex.Actor) {
    if (!this.canReceiveKnockback()) {
      return;
    }
    if (
      "isFacingLeft" in attacker &&
      typeof attacker.isFacingLeft === "function"
    ) {
      this.knockBackFromFacing(attacker.isFacingLeft());
      return;
    }
    const attackerCenterX = attacker.pos.x + attacker.width / 2;
    const direction = this.centerX() < attackerCenterX ? -1 : 1;
    this.applyKnockbackImpulse(direction);
  }

  public takeDamageFrom(attacker: ex.Actor, damage: number = 1): boolean {
    if (!this.canTakeDamage()) {
      return false;
    }
    const depleted = this.applyDamage(damage);
    if (depleted) {
      return true;
    }
    this.knockBackFromAttacker(attacker);
    return true;
  }

  public syncHealth(health: unknown) {
    this.syncLivingHealth(health);
  }

  protected applySyncedNetworkPosition(
    partial: { x?: number | string; y?: number | string },
    applyVisualCorrection: (
      position: ex.Vector,
      snapDistancePx: number,
      correctionOptions?: { forceHardSnap?: boolean },
    ) => void,
    afterSync?: () => void,
    options?: {
      resetVelocity?: boolean;
      forceHardSnap?: boolean;
    },
  ): void {
    const hasX = partial.x !== undefined;
    const hasY = partial.y !== undefined;
    if (!hasX && !hasY) {
      return;
    }
    const nextX = hasX ? Number(partial.x) : this.pos.x;
    const nextY = hasY ? Number(partial.y) : this.pos.y;
    if (!Number.isFinite(nextX) || !Number.isFinite(nextY)) {
      return;
    }
    const target = ex.vec(nextX, nextY);
    if (this.pos.distance(target) < remotePositionTolerancePx) {
      return;
    }
    if (options?.resetVelocity !== false) {
      this.hspeed = 0;
      this.vspeed = 0;
    }
    applyVisualCorrection(target, remotePositionSnapDistancePx, {
      forceHardSnap: options?.forceHardSnap,
    });
    afterSync?.();
  }

  protected applyKnockbackImpulse(direction: number) {
    this.hspeed = this.knockback.horizontalSpeed * direction;
    this.vspeed = this.knockback.verticalSpeed;
    this.knockbackTimeRemainingMs = this.knockback.durationMs;
    this.onKnockbackApplied();
  }

  protected onKnockbackApplied() {}

  protected clearKnockback() {
    this.knockbackTimeRemainingMs = 0;
  }

  protected applyDamage(damage: number): boolean {
    if (!this.canTakeDamage()) {
      return false;
    }
    this.health = Math.max(this.health - damage, 0);
    this.damageImmunityTimeRemainingMs = this.damageImmunityDurationMs;
    this.damageFlash.start();
    if (this.health <= 0) {
      this.onHealthDepleted();
      return true;
    }
    return false;
  }

  protected syncLivingHealth(health: unknown) {
    const nextHealth = Number(health);
    if (!Number.isFinite(nextHealth)) {
      return;
    }
    const previousHealth = this.health;
    this.health = Math.max(0, Math.min(nextHealth, this.maxHealth));
    if (this.health < previousHealth) {
      this.damageFlash.start();
      this.damageImmunityTimeRemainingMs = this.damageImmunityDurationMs;
    }
  }

  protected abstract onHealthDepleted(): void;

  protected abstract separationKind(): LivingSeparationKind;

  protected canParticipateInSeparation(canSeparate: boolean) {
    return canSeparate && this.isAlive();
  }

  protected separationDimensions() {
    return {
      width: this.width,
      height: this.height,
    };
  }

  public entitySeparationBody(
    entityId: string,
    canSeparate: boolean,
  ): EntitySeparationBody {
    const dimensions = this.separationDimensions();
    return {
      id: `${this.separationKind()}:${entityId}`,
      x: this.pos.x,
      y: this.pos.y,
      horizontalSpeed: this.hspeed,
      verticalSpeed: this.vspeed,
      width: dimensions.width,
      height: dimensions.height,
      isGrounded: this.isGrounded,
      isJumping: this.isJumping,
      collisionBounds: this.collisionBounds,
      canSeparate: this.canParticipateInSeparation(canSeparate),
    };
  }

  public applySeparatedX(x: number) {
    if (this.pos.x === x) {
      return;
    }
    this.pos.x = x;
    this.onSeparatedX(x);
  }

  protected onSeparatedX(_x: number) {
    void _x;
  }

  public separationEntry(entityId: string, canSeparate: boolean) {
    return {
      body: this.entitySeparationBody(entityId, canSeparate),
      applySeparatedX: (x: number) => {
        this.applySeparatedX(x);
      },
    };
  }
}
