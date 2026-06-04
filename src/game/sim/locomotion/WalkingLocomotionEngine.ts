import {
  applyGravity,
  stepEntityWithVelocity,
  type EntityPhysicsOptions,
  type EntityPhysicsState,
  type WalkingTuning,
} from "../../../physics/entityPhysics.js";
import { PHYSICS_TICK_HZ } from "../../../world/physicsConfig.js";

const approach = (start: number, end: number, amount: number) => {
  if (start < end) {
    return Math.min(start + amount, end);
  }
  return Math.max(start - amount, end);
};

export interface WalkingLocomotionStep {
  readonly moveSign: number;
  readonly deltaMs: number;
  readonly walkGravity: number;
  readonly speedMultiplier?: number;
}

/** Shared horizontal movement, gravity, and tile collision stepping. */
export class WalkingLocomotionEngine {
  constructor(private readonly tuning: WalkingTuning) {}

  horizontalAccelerationFor(moveSign: number, horizontalSpeed: number): number {
    if (moveSign === 0) {
      return this.tuning.stopDeceleration;
    }
    if (
      Math.sign(horizontalSpeed) !== 0 &&
      Math.sign(horizontalSpeed) !== moveSign
    ) {
      return this.tuning.turnAcceleration;
    }
    return this.tuning.walkAcceleration;
  }

  stepLocomotion(
    state: EntityPhysicsState,
    options: EntityPhysicsOptions & { dt: number; positionScale: number },
    step: WalkingLocomotionStep,
  ): EntityPhysicsState {
    const dt = step.deltaMs / 1000;
    const speedMultiplier = step.speedMultiplier ?? 1;
    const targetHspeed = step.moveSign * this.tuning.walkSpeed * speedMultiplier;
    const accel = this.horizontalAccelerationFor(
      step.moveSign,
      state.horizontalSpeed,
    );
    const approachAmount = accel * 60 * dt;
    const horizontalSpeed = approach(
      state.horizontalSpeed,
      targetHspeed,
      approachAmount,
    );
    let verticalSpeed = state.verticalSpeed;
    if (state.isGrounded) {
      if (verticalSpeed > 0) {
        verticalSpeed = 0;
      }
    } else {
      verticalSpeed = applyGravity(verticalSpeed, step.walkGravity, dt);
    }
    return stepEntityWithVelocity(
      { ...state, horizontalSpeed, verticalSpeed },
      options,
    );
  }

  stepKnockback(
    state: EntityPhysicsState,
    options: EntityPhysicsOptions & { dt: number; positionScale: number },
    knockbackFriction: number,
    deltaMs: number,
  ): EntityPhysicsState {
    const dt = deltaMs / 1000;
    const verticalSpeed = applyGravity(
      state.verticalSpeed,
      this.tuning.gravity,
      dt,
    );
    const next = stepEntityWithVelocity(
      { ...state, verticalSpeed },
      options,
    );
    const stepsAtReferenceRate = deltaMs / (1000 / PHYSICS_TICK_HZ);
    return {
      ...next,
      horizontalSpeed:
        next.horizontalSpeed * Math.pow(knockbackFriction, stepsAtReferenceRate),
    };
  }
}
