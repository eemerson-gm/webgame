import type {
  EntityPhysicsOptions,
  EntityPhysicsState,
  TileCollisionWorld,
} from "../../physics/entityPhysics.js";
import type { EntitySimulation } from "./EntitySimulation.js";
import { NetworkedEntityState } from "./NetworkedEntityState.js";
import { SlimeLocomotionSimulator } from "./locomotion/SlimeLocomotionSimulator.js";
import { SlimeWanderController } from "./SlimeWanderController.js";
import { slimeWalkingTuning } from "./simConfig.js";

export class SlimeSimulation implements EntitySimulation {
  readonly state = new NetworkedEntityState();
  readonly wander = new SlimeWanderController();
  private readonly locomotion = new SlimeLocomotionSimulator(
    this.state,
    slimeWalkingTuning,
  );

  constructor(initial?: Partial<EntityPhysicsState>) {
    if (initial) {
      this.state.apply(initial);
    }
  }

  snapshotState(): Readonly<NetworkedEntityState> {
    return this.state;
  }

  stepLocomotion(
    moveSign: number,
    deltaMs: number,
    world: TileCollisionWorld,
    options: EntityPhysicsOptions & { positionScale: number },
  ): void {
    const dt = deltaMs / 1000;
    this.locomotion.stepLocomotion(moveSign, deltaMs, {
      ...options,
      world,
      dt,
    });
  }

  tryWallJump(
    moveSign: number,
    world: TileCollisionWorld,
    collisionBounds: EntityPhysicsOptions["collisionBounds"],
  ): boolean {
    if (
      !this.locomotion.shouldJumpForTileAhead(moveSign, world, collisionBounds)
    ) {
      return false;
    }
    return this.locomotion.tryJump();
  }
}
