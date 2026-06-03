import * as ex from "excalibur";
import { DamageFlash } from "./DamageableActor";
import type {
  CollisionBounds,
  EntitySeparationBody,
  TileCollisionWorld,
} from "./MovingActor";
import { MovingActor } from "./MovingActor";

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

export abstract class LivingActor extends MovingActor {
  public health: number;
  public readonly maxHealth: number;
  protected damageImmunityTimeRemainingMs: number = 0;
  protected knockbackTimeRemainingMs: number = 0;
  private readonly damageImmunityDurationMs: number;
  protected readonly knockback: LivingKnockback;
  private readonly damageFlash: DamageFlash;

  constructor(
    pos: ex.Vector,
    tilemap: ex.TileMap,
    size: ex.Vector,
    collisionBounds: CollisionBounds,
    vitality: LivingVitality,
    collisionWorld?: TileCollisionWorld,
    knockback: LivingKnockback = defaultLivingKnockback,
  ) {
    super(pos, tilemap, size, collisionBounds, collisionWorld);
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

  protected isKnockbackActive() {
    return this.knockbackTimeRemainingMs > 0;
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
