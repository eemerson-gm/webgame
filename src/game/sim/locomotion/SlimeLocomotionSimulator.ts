import {
  tileMeeting,
  type EntityPhysicsOptions,
  type TileCollisionWorld,
} from "../../../physics/entityPhysics.js";
import { TILE_PX } from "../../../world/worldConfig.js";
import type { WalkingTuning } from "../../../physics/entityPhysics.js";
import type { NetworkedEntityState } from "../NetworkedEntityState.js";
import { WalkingLocomotionEngine } from "./WalkingLocomotionEngine.js";

/** Slime walking, gravity, and wall-jump (client + server). */
export class SlimeLocomotionSimulator {
  private readonly engine: WalkingLocomotionEngine;

  constructor(
    private readonly state: NetworkedEntityState,
    private readonly tuning: WalkingTuning,
  ) {
    this.engine = new WalkingLocomotionEngine(tuning);
  }

  stepLocomotion(
    moveSign: number,
    deltaMs: number,
    options: EntityPhysicsOptions & { dt: number; positionScale: number },
  ): void {
    const next = this.engine.stepLocomotion(
      this.state.toPhysicsState(),
      options,
      { moveSign, deltaMs, walkGravity: this.tuning.gravity },
    );
    this.state.apply(next);
  }

  stepKnockback(
    options: EntityPhysicsOptions & { dt: number; positionScale: number },
    knockbackFriction: number,
    deltaMs: number,
  ): void {
    const next = this.engine.stepKnockback(
      this.state.toPhysicsState(),
      options,
      knockbackFriction,
      deltaMs,
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
    return true;
  }

  shouldJumpForTileAhead(
    moveSign: number,
    world: TileCollisionWorld,
    collisionBounds: EntityPhysicsOptions["collisionBounds"],
  ): boolean {
    if (!this.state.isGrounded || moveSign === 0) {
      return false;
    }
    const options = { collisionBounds, world };
    if (tileMeeting(this.state.x, this.state.y - TILE_PX, options)) {
      return false;
    }
    const probeX = this.state.x + moveSign * TILE_PX;
    if (!tileMeeting(probeX, this.state.y, options)) {
      return false;
    }
    return !tileMeeting(probeX, this.state.y - TILE_PX, options);
  }
}
