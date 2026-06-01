import * as ex from "excalibur";
import { DamageFlash } from "./DamageableActor";
import type {
  CollisionBounds,
  EntitySeparationBody,
  TileCollisionWorld,
} from "./MovingActor";
import { WalkingActor, type WalkingTuning } from "./WalkingActor";

export type LivingVitality = {
  maxHealth: number;
  damageImmunityDurationMs: number;
  damageBlinkFrameMs: number;
};

export type LivingSeparationKind = "player" | "entity";

export abstract class LivingActor extends WalkingActor {
  public health: number;
  public readonly maxHealth: number;
  protected damageImmunityTimeRemainingMs: number = 0;
  private readonly damageImmunityDurationMs: number;
  private readonly damageFlash: DamageFlash;

  constructor(
    pos: ex.Vector,
    tilemap: ex.TileMap,
    size: ex.Vector,
    collisionBounds: CollisionBounds,
    tuning: WalkingTuning,
    vitality: LivingVitality,
    collisionWorld?: TileCollisionWorld,
  ) {
    super(pos, tilemap, size, collisionBounds, tuning, collisionWorld);
    this.maxHealth = vitality.maxHealth;
    this.health = vitality.maxHealth;
    this.damageImmunityDurationMs = vitality.damageImmunityDurationMs;
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
