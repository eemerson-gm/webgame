import type { TileCollisionWorld } from "../physics/entityPhysics";
import { physicsMaxFrameDeltaMs } from "../world/physicsConfig";
import type { ClientWorldLivingEntities } from "./ClientWorldLivingEntities";
import { FixedStepRunner } from "./sim/FixedStepRunner";

/** Fixed-step entity separation on the client (matches server cadence). */
export class ClientEntitySeparation {
  private readonly stepper = new FixedStepRunner();

  constructor(
    private readonly livingEntities: ClientWorldLivingEntities,
  ) {}

  public tickFrame(frameDeltaMs: number, world: TileCollisionWorld): void {
    const delta = Math.min(frameDeltaMs, physicsMaxFrameDeltaMs);
    this.stepper.runFrame(delta, () => {
      this.livingEntities.applyEntitySeparation(world);
    });
  }

  public reset(): void {
    this.stepper.reset();
  }
}
