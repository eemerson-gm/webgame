import type { EntityPhysicsOptions } from "../../../physics/entityPhysics.js";
import type { WalkingTuning } from "../../../physics/entityPhysics.js";
import {
  jumpFallGravityMultiplier,
  jumpHeldGravityMultiplier,
  jumpReleasedGravityMultiplier,
  playerJumpHoldDurationMs,
} from "../simConfig.js";
import type { NetworkedEntityState } from "../NetworkedEntityState.js";
import { WalkingLocomotionEngine } from "./WalkingLocomotionEngine.js";

export interface PlayerLocomotionInput {
  readonly keyJump: boolean;
  readonly isRunning: boolean;
  readonly runSpeedMultiplier: number;
}

/** Player jump-hold gravity and locomotion (client + server). */
export class PlayerLocomotionSimulator {
  private readonly engine: WalkingLocomotionEngine;
  public jumpHoldTimeRemainingMs = 0;

  constructor(
    private readonly state: NetworkedEntityState,
    private readonly tuning: WalkingTuning,
  ) {
    this.engine = new WalkingLocomotionEngine(tuning);
  }

  walkGravityForStep(
    deltaMs: number,
    keyJump: boolean,
    verticalSpeed: number,
    isJumping: boolean,
  ): number {
    if (!isJumping) {
      this.jumpHoldTimeRemainingMs = 0;
      return this.tuning.gravity;
    }
    if (this.shouldHoldJump(keyJump, verticalSpeed)) {
      this.jumpHoldTimeRemainingMs = Math.max(
        0,
        this.jumpHoldTimeRemainingMs - deltaMs,
      );
      return this.tuning.gravity * jumpHeldGravityMultiplier;
    }
    this.jumpHoldTimeRemainingMs = 0;
    if (verticalSpeed < 0) {
      return this.tuning.gravity * jumpReleasedGravityMultiplier;
    }
    return this.tuning.gravity * jumpFallGravityMultiplier;
  }

  stepLocomotion(
    moveSign: number,
    deltaMs: number,
    options: EntityPhysicsOptions & { dt: number; positionScale: number },
    input: PlayerLocomotionInput,
  ): void {
    const runMult = input.isRunning ? input.runSpeedMultiplier : 1;
    const walkGravity = this.walkGravityForStep(
      deltaMs,
      input.keyJump,
      this.state.verticalSpeed,
      this.state.isJumping,
    );
    const next = this.engine.stepLocomotion(
      this.state.toPhysicsState(),
      options,
      { moveSign, deltaMs, walkGravity, speedMultiplier: runMult },
    );
    this.state.apply(next);
  }

  tryJump(): boolean {
    if (!this.state.isGrounded) {
      return false;
    }
    this.state.verticalSpeed = this.tuning.jumpSpeed;
    this.state.isGrounded = false;
    this.state.isJumping = true;
    this.jumpHoldTimeRemainingMs = playerJumpHoldDurationMs;
    return true;
  }

  private shouldHoldJump(keyJump: boolean, verticalSpeed: number): boolean {
    if (!keyJump || !this.state.isJumping || verticalSpeed >= 0) {
      return false;
    }
    return this.jumpHoldTimeRemainingMs > 0;
  }
}
