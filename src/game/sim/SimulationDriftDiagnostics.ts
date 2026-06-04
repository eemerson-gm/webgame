import type { SimulationHashFields } from "./SimulationStateHash.js";
import {
  firstSimulationFieldDiff,
  hashSimulationState,
} from "./SimulationStateHash.js";

const driftLoggingEnabled = (): boolean =>
  typeof process !== "undefined" &&
  process.env.GAME_SIM_DRIFT_LOG === "1";

/** Debug-only drift logging when local and remote hashes diverge. */
export class SimulationDriftDiagnostics {
  public checkEntity(
    entityId: string,
    serverTick: number,
    local: SimulationHashFields,
    remote: SimulationHashFields,
  ): void {
    if (!driftLoggingEnabled()) {
      return;
    }
    const localHash = hashSimulationState(local);
    const remoteHash = hashSimulationState(remote);
    if (localHash === remoteHash) {
      return;
    }
    const diff = firstSimulationFieldDiff(local, remote);
    console.warn("[sim-drift]", {
      entityId,
      serverTick,
      localHash,
      remoteHash,
      diff,
    });
  }
}
