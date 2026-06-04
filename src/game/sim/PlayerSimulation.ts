import type {
  EntityPhysicsOptions,
  EntityPhysicsState,
} from "../../physics/entityPhysics.js";
import type { TileCollisionWorld } from "../../physics/entityPhysics.js";
import type { EntitySimulation } from "./EntitySimulation.js";
import { NetworkedEntityState } from "./NetworkedEntityState.js";
import {
  PlayerLocomotionSimulator,
  type PlayerLocomotionInput,
} from "./locomotion/PlayerLocomotionSimulator.js";
import { playerWalkingTuning } from "./simConfig.js";

export class PlayerSimulation implements EntitySimulation {
  readonly state = new NetworkedEntityState();
  private readonly locomotion = new PlayerLocomotionSimulator(
    this.state,
    playerWalkingTuning,
  );

  constructor(initial?: Partial<EntityPhysicsState>) {
    if (initial) {
      this.state.apply(initial);
    }
  }

  snapshotState(): Readonly<NetworkedEntityState> {
    return this.state;
  }

  step(
    deltaMs: number,
    world: TileCollisionWorld,
    moveSign: number,
    input: PlayerLocomotionInput,
    options: EntityPhysicsOptions & { positionScale: number },
  ): void {
    const dt = deltaMs / 1000;
    this.locomotion.stepLocomotion(
      moveSign,
      deltaMs,
      { ...options, world, dt },
      input,
    );
    if (input.keyJump && this.state.isGrounded) {
      this.locomotion.tryJump();
    }
  }

  get jumpHoldTimeRemainingMs(): number {
    return this.locomotion.jumpHoldTimeRemainingMs;
  }
}
