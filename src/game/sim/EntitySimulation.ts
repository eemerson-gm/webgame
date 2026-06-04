import type { NetworkedEntityState } from "./NetworkedEntityState.js";

export interface EntitySimulation {
  readonly state: NetworkedEntityState;
  snapshotState(): Readonly<NetworkedEntityState>;
}
