import {
  type CollisionBounds,
  type EntityPhysicsOptions,
  type EntityPhysicsState,
  type EntitySeparationBody,
  type TileCollisionWorld,
} from "../../physics/entityPhysics";
import {
  defaultKnockback,
  simCollisionBounds,
  simEntityHeight,
  simEntityWidth,
  type LivingKnockback,
  type LivingVitality,
  type WalkingTuning,
} from "./simConfig";
import { WalkingLocomotionEngine } from "./locomotion/WalkingLocomotionEngine";

export abstract class SimWalkingEntity {
  public x: number;
  public y: number;
  public horizontalSpeed: number = 0;
  public verticalSpeed: number = 0;
  public isGrounded: boolean = false;
  public isJumping: boolean = false;
  public facingLeft: boolean = false;
  public health: number;
  public readonly maxHealth: number;

  protected damageImmunityTimeRemainingMs: number = 0;
  protected knockbackTimeRemainingMs: number = 0;
  protected readonly knockback: LivingKnockback;
  protected readonly damageImmunityDurationMs: number;
  private readonly walkEngine: WalkingLocomotionEngine;

  protected constructor(
    x: number,
    y: number,
    protected readonly tuning: WalkingTuning,
    vitality: LivingVitality,
    knockback: LivingKnockback = defaultKnockback,
  ) {
    this.x = x;
    this.y = y;
    this.maxHealth = vitality.maxHealth;
    this.health = vitality.maxHealth;
    this.damageImmunityDurationMs = vitality.damageImmunityDurationMs;
    this.knockback = knockback;
    this.walkEngine = new WalkingLocomotionEngine(tuning);
  }

  public abstract readonly id: string;

  protected abstract horizontalMoveSign(): number;

  protected abstract canSeparate(): boolean;

  protected abstract separationKind(): "player" | "entity";

  public tickDamageTimers(deltaMs: number) {
    this.damageImmunityTimeRemainingMs = Math.max(
      this.damageImmunityTimeRemainingMs - deltaMs,
      0,
    );
    this.knockbackTimeRemainingMs = Math.max(
      this.knockbackTimeRemainingMs - deltaMs,
      0,
    );
  }

  public isKnockbackActive(): boolean {
    return this.knockbackTimeRemainingMs > 0;
  }

  public isAlive(): boolean {
    return this.health > 0;
  }

  public canTakeDamage(): boolean {
    if (!this.isAlive()) {
      return false;
    }
    if (this.damageImmunityTimeRemainingMs > 0) {
      return false;
    }
    return true;
  }

  public applyDamage(damage: number): boolean {
    if (!this.canTakeDamage()) {
      return false;
    }
    this.health = Math.max(this.health - damage, 0);
    this.damageImmunityTimeRemainingMs = this.damageImmunityDurationMs;
    return this.health <= 0;
  }

  public knockBackFromFacing(facingLeft: boolean) {
    if (!this.isAlive()) {
      return;
    }
    const direction = facingLeft ? -1 : 1;
    this.horizontalSpeed = this.knockback.horizontalSpeed * direction;
    this.verticalSpeed = this.knockback.verticalSpeed;
    this.knockbackTimeRemainingMs = this.knockback.durationMs;
    this.isGrounded = false;
    this.isJumping = true;
  }

  public stepPhysics(deltaMs: number, world: TileCollisionWorld) {
    const moveSign = this.horizontalMoveSign();
    if (this.isKnockbackActive()) {
      this.stepKnockback(deltaMs, world);
      return;
    }
    this.stepLocomotion(moveSign, deltaMs, world);
    this.tryJump();
  }

  protected tryJump() {}

  protected walkGravityForStep(deltaMs: number): number {
    void deltaMs;
    return this.tuning.gravity;
  }

  protected stepLocomotion(
    moveSign: number,
    deltaMs: number,
    world: TileCollisionWorld,
  ) {
    const dt = deltaMs / 1000;
    this.applyEntityState(
      this.walkEngine.stepLocomotion(
        this.entityState(),
        this.stepOptions(world, dt),
        {
          moveSign,
          deltaMs,
          walkGravity: this.walkGravityForStep(deltaMs),
        },
      ),
    );
  }

  protected stepKnockback(deltaMs: number, world: TileCollisionWorld) {
    const dt = deltaMs / 1000;
    this.applyEntityState(
      this.walkEngine.stepKnockback(
        this.entityState(),
        this.stepOptions(world, dt),
        this.knockback.friction,
        deltaMs,
      ),
    );
  }

  protected startJump(jumpSpeed: number): boolean {
    if (!this.isGrounded) {
      return false;
    }
    this.verticalSpeed = jumpSpeed;
    this.isGrounded = false;
    this.isJumping = true;
    return true;
  }

  public toSeparationBody(): EntitySeparationBody {
    return {
      id: this.id,
      x: this.x,
      y: this.y,
      width: simEntityWidth,
      height: simEntityHeight,
      horizontalSpeed: this.horizontalSpeed,
      verticalSpeed: this.verticalSpeed,
      isGrounded: this.isGrounded,
      isJumping: this.isJumping,
      collisionBounds: simCollisionBounds,
      canSeparate: this.canSeparate(),
    };
  }

  public applySeparationX(x: number) {
    this.x = x;
  }

  protected entityState(): EntityPhysicsState {
    return {
      x: this.x,
      y: this.y,
      horizontalSpeed: this.horizontalSpeed,
      verticalSpeed: this.verticalSpeed,
      width: simEntityWidth,
      height: simEntityHeight,
      isGrounded: this.isGrounded,
      isJumping: this.isJumping,
    };
  }

  protected applyEntityState(state: EntityPhysicsState) {
    this.x = state.x;
    this.y = state.y;
    this.horizontalSpeed = state.horizontalSpeed;
    this.verticalSpeed = state.verticalSpeed;
    this.isGrounded = state.isGrounded;
    this.isJumping = state.isJumping;
  }

  protected physicsOptions(world: TileCollisionWorld): EntityPhysicsOptions {
    return {
      collisionBounds: simCollisionBounds,
      world,
    };
  }

  protected stepOptions(world: TileCollisionWorld, dt: number) {
    return {
      ...this.physicsOptions(world),
      positionScale: this.tuning.positionScale,
      dt,
    };
  }

  public hurtCollisionBounds(): CollisionBounds {
    return simCollisionBounds;
  }
}
