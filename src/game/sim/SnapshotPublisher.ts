import type {
  AuthoritativeEntitySnapshot,
  AuthoritativePlayerSnapshot,
  WorldSnapshotPayload,
} from "../../classes/GameWire";
import type { SimPlayer } from "./SimPlayer";
import type { SimSlime } from "./SimSlime";

export class SnapshotPublisher {
  public buildSnapshot(
    tick: number,
    players: ReadonlyMap<string, SimPlayer>,
    slimes: ReadonlyMap<string, SimSlime>,
    removedEntityIds: readonly string[],
  ): WorldSnapshotPayload {
    const playerSnapshots: Record<string, AuthoritativePlayerSnapshot> = {};
    players.forEach((player, id) => {
      const input = player.inputForSnapshot();
      playerSnapshots[id] = {
        x: player.x,
        y: player.y,
        horizontalSpeed: player.horizontalSpeed,
        verticalSpeed: player.verticalSpeed,
        facingLeft: player.facingLeft,
        health: player.health,
        isPaused: false,
        attackCycle: player.attackCycle,
        lastProcessedInputSequence: player.lastProcessedInputSequence,
        keyLeft: input.keyLeft,
        keyRight: input.keyRight,
        keyJump: input.keyJump,
        keyDown: input.keyDown,
        keyAttack: player.isSwordAttackActive(),
      };
    });
    const entitySnapshots: Record<string, AuthoritativeEntitySnapshot> = {};
    slimes.forEach((slime, id) => {
      if (slime.isDead) {
        return;
      }
      const wanderTiming = slime.wander.snapshotTiming();
      entitySnapshots[id] = {
        type: "slime",
        ownerId: slime.ownerId,
        x: slime.x,
        y: slime.y,
        wanderSign: slime.wanderSign,
        facingLeft: slime.facingLeft,
        health: slime.health,
        wanderDecisionElapsedMs: wanderTiming.wanderDecisionElapsedMs,
        wanderDecisionDelayMs: wanderTiming.wanderDecisionDelayMs,
      };
    });
    return {
      tick,
      players: playerSnapshots,
      entities: entitySnapshots,
      removedEntityIds:
        removedEntityIds.length > 0 ? [...removedEntityIds] : undefined,
    };
  }
}
