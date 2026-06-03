import * as ex from "excalibur";
import {
  physicsFixedStepMs,
  physicsMaxFrameDeltaMs,
  PHYSICS_TICK_HZ,
} from "../world/physicsConfig";
import { TILE_PX } from "../world/worldConfig";
import type { CollisionBounds, TileCollisionWorld } from "./MovingActor";
import {
  LivingActor,
  type LivingKnockback,
  type LivingVitality,
} from "./LivingActor";
import type { LocomotionVisual, LocomotionVisualsHost } from "./walking/LocomotionVisuals";

const approach = (start: number, end: number, amount: number) => {
  if (start < end) {
    return Math.min(start + amount, end);
  }
  return Math.max(start - amount, end);
};

const collisionWidth = TILE_PX - 4;
const collisionHeight = TILE_PX - 2;
const collisionEdgeInset = 0.1;
const bodyRestCenterY = TILE_PX / 2;

export const collisionOffsetForGraphicCenter = (center: ex.Vector): CollisionBounds => ({
  offsetX: center.x - collisionWidth / 2,
  offsetY: TILE_PX - collisionHeight + (center.y - bodyRestCenterY),
  width: collisionWidth,
  height: collisionHeight,
  edgeInset: collisionEdgeInset,
});

export type WalkingTuning = {
  walkSpeed: number;
  walkAcceleration: number;
  stopDeceleration: number;
  turnAcceleration: number;
  gravity: number;
  jumpSpeed: number;
  positionScale: number;
};

export abstract class WalkingActor extends LivingActor {
  protected readonly walkingTuning: WalkingTuning;
  protected physicsAccumulatorMs: number = 0;
  protected readonly fixedStepMs: number = physicsFixedStepMs;
  protected readonly maxFrameDeltaMs: number = physicsMaxFrameDeltaMs;

  constructor(
    pos: ex.Vector,
    tilemap: ex.TileMap,
    size: ex.Vector,
    collisionBounds: CollisionBounds,
    tuning: WalkingTuning,
    vitality: LivingVitality,
    collisionWorld?: TileCollisionWorld,
    knockback?: LivingKnockback,
  ) {
    super(pos, tilemap, size, collisionBounds, vitality, collisionWorld, knockback);
    this.walkingTuning = tuning;
  }

  protected abstract locomotionVisuals(): LocomotionVisualsHost;

  protected abstract horizontalMoveSign(): number;

  protected resolveLocomotionVisual(moveSign: number): LocomotionVisual {
    if (!this.isGrounded) {
      return "jump";
    }
    if (moveSign !== 0) {
      return "walk";
    }
    return "idle";
  }

  protected shouldSyncFacingFromMoveSign(moveSign: number) {
    return moveSign === moveSign;
  }

  protected tryJump() {}

  protected onJumpStarted() {}

  protected onLand() {}

  protected startJump(jumpSpeed: number): boolean {
    if (!this.jump(jumpSpeed)) {
      return false;
    }
    this.onJumpStarted();
    return true;
  }

  protected syncCollisionToSprite() {
    const center = this.locomotionVisuals().bodyGraphicCenter();
    const next = collisionOffsetForGraphicCenter(center);
    this.collisionBounds.offsetX = next.offsetX;
    this.collisionBounds.offsetY = next.offsetY;
  }

  protected syncLocomotionVisuals(moveSign: number) {
    if (this.shouldSyncFacingFromMoveSign(moveSign)) {
      this.syncFacingFromHorizontalSign(moveSign);
    }
    const visual = this.resolveLocomotionVisual(moveSign);
    this.locomotionVisuals().setLocomotionVisual(visual);
    this.locomotionVisuals().updateFacing(this.facingLeft);
  }

  protected horizontalAccelerationFor(moveSign: number) {
    if (moveSign === 0) {
      return this.walkingTuning.stopDeceleration;
    }
    if (Math.sign(this.hspeed) !== 0 && Math.sign(this.hspeed) !== moveSign) {
      return this.walkingTuning.turnAcceleration;
    }
    return this.walkingTuning.walkAcceleration;
  }

  protected walkGravityForStep(deltaMs: number) {
    if (deltaMs < 0) {
      return this.walkingTuning.gravity;
    }
    return this.walkingTuning.gravity;
  }

  protected moveWithWalkingGravity(dt: number, moveSign: number, deltaMs: number) {
    const targetHspeed = moveSign * this.walkingTuning.walkSpeed;
    const horizontalAcceleration = this.horizontalAccelerationFor(moveSign);
    this.hspeed = approach(
      this.hspeed,
      targetHspeed,
      horizontalAcceleration * 60 * dt,
    );
    this.applyGravity(this.walkGravityForStep(deltaMs), dt);
    this.moveWithVelocity(this.walkingTuning.positionScale, dt);
  }

  protected stepKnockbackPhysics(delta: number) {
    const dt = delta / 1000;
    this.applyGravity(this.walkingTuning.gravity, dt);
    this.moveWithVelocity(this.walkingTuning.positionScale, dt);
    const stepsAtReferenceRate = delta / (1000 / PHYSICS_TICK_HZ);
    this.hspeed *= Math.pow(this.knockback.friction, stepsAtReferenceRate);
  }

  protected stepLocomotionPhysics(moveSign: number, delta: number) {
    const wasGrounded = this.isGrounded;
    if (this.isKnockbackActive()) {
      this.stepKnockbackPhysics(delta);
      this.syncLocomotionVisuals(0);
    } else {
      const dt = delta / 1000;
      this.moveWithWalkingGravity(dt, moveSign, delta);
      this.tryJump();
      this.syncLocomotionVisuals(moveSign);
    }
    if (!wasGrounded && this.isGrounded) {
      this.onLand();
    }
  }

  protected runFixedWalkingSteps(moveSign: number, frameDelta: number) {
    this.physicsAccumulatorMs += frameDelta;
    while (this.physicsAccumulatorMs >= this.fixedStepMs) {
      this.stepLocomotionPhysics(moveSign, this.fixedStepMs);
      this.physicsAccumulatorMs -= this.fixedStepMs;
    }
  }

  protected tickWalkingFrame(delta: number) {
    const frameDelta = Math.min(delta, this.maxFrameDeltaMs);
    this.locomotionVisuals().update(frameDelta);
    const moveSign = this.horizontalMoveSign();
    this.runFixedWalkingSteps(moveSign, frameDelta);
    this.syncCollisionToSprite();
  }
}
