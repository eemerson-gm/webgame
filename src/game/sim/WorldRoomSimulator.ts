import type { TerrainTileKind } from "../../classes/GameWire";
import { separateEntityBodies } from "../../physics/entityPhysics";
import { physicsFixedStepMs } from "../../world/physicsConfig";
import {
  entitySeparationMaxMoveX,
  entitySeparationPadding,
  entitySeparationPasses,
  snapshotIntervalTicks,
} from "./simConfig";
import { SimCombatSystem } from "./SimCombatSystem";
import { SimPhysicsWorld } from "./SimPhysicsWorld";
import { SimPlayer, type SimPlayerInput } from "./SimPlayer";
import { SimSlime } from "./SimSlime";
import { SnapshotPublisher } from "./SnapshotPublisher";
import type { WorldSnapshotPayload } from "../../classes/GameWire";

export class WorldRoomSimulator {
  private readonly physicsWorld: SimPhysicsWorld;
  private readonly combat = new SimCombatSystem();
  private readonly snapshots = new SnapshotPublisher();
  private readonly players = new Map<string, SimPlayer>();
  private readonly slimes = new Map<string, SimSlime>();
  private tickCount = 0;
  private nextEntityIndex = 1;
  private readonly removedEntityIds: string[] = [];
  private accumulatorMs = 0;
  private running = false;

  constructor(
    columns: number,
    rows: number,
    terrainTiles: Record<string, TerrainTileKind>,
    private readonly seed: number,
  ) {
    this.physicsWorld = new SimPhysicsWorld(columns, rows, terrainTiles);
  }

  public start() {
    this.running = true;
  }

  public stop() {
    this.running = false;
  }

  public hasPlayers(): boolean {
    return this.players.size > 0;
  }

  public addPlayer(playerId: string, spawnX: number, spawnY: number): SimPlayer {
    const player = new SimPlayer(playerId, spawnX, spawnY);
    this.players.set(playerId, player);
    return player;
  }

  public removePlayer(playerId: string) {
    this.players.delete(playerId);
  }

  public queuePlayerInput(
    playerId: string,
    sequence: number,
    input: SimPlayerInput,
  ) {
    const player = this.players.get(playerId);
    if (!player) {
      return;
    }
    player.applyInput(sequence, input);
  }

  public createSlime(ownerId: string, x: number, y: number): string {
    const entityId = `slime:${this.nextEntityIndex++}`;
    const rng = this.seededRng(entityId);
    const slime = new SimSlime(entityId, ownerId, x, y, rng);
    this.slimes.set(entityId, slime);
    return entityId;
  }

  public buildImmediateSnapshot(): WorldSnapshotPayload {
    return this.snapshots.buildSnapshot(
      this.tickCount,
      this.players,
      this.slimes,
      this.removedEntityIds,
    );
  }

  public tickFrame(frameDeltaMs: number): WorldSnapshotPayload | null {
    if (!this.running) {
      return null;
    }
    this.accumulatorMs += frameDeltaMs;
    while (this.accumulatorMs >= physicsFixedStepMs) {
      this.accumulatorMs -= physicsFixedStepMs;
      this.simulateStep(physicsFixedStepMs);
    }
    if (this.tickCount % snapshotIntervalTicks !== 0) {
      return null;
    }
    const payload = this.snapshots.buildSnapshot(
      this.tickCount,
      this.players,
      this.slimes,
      this.removedEntityIds,
    );
    this.removedEntityIds.length = 0;
    return payload;
  }

  /** Fixed tick order: timers → locomotion → separation → combat (mirrored on client). */
  private simulateStep(deltaMs: number) {
    this.tickCount += 1;
    this.players.forEach((player) => {
      player.tickDamageTimers(deltaMs);
      player.tickAttackTimer(deltaMs);
    });
    this.slimes.forEach((slime) => {
      if (slime.isDead) {
        return;
      }
      slime.tickDamageTimers(deltaMs);
      slime.tickWanderDecision(deltaMs);
      slime.stepPhysics(deltaMs, this.physicsWorld);
    });
    this.separateEntities();
    this.combat.tick([...this.players.values()], [...this.slimes.values()]);
    this.pruneDeadSlimes();
  }

  private separateEntities() {
    const bodies = [
      ...[...this.players.values()].map((p) => p.toSeparationBody()),
      ...[...this.slimes.values()]
        .filter((s) => !s.isDead)
        .map((s) => s.toSeparationBody()),
    ];
    const separated = separateEntityBodies(bodies, {
      world: this.physicsWorld,
      padding: entitySeparationPadding,
      maxMoveX: entitySeparationMaxMoveX,
      passes: entitySeparationPasses,
    });
    const byId = new Map(separated.map((body) => [body.id, body]));
    this.players.forEach((player) => {
      const body = byId.get(player.id);
      if (body) {
        player.applySeparationX(body.x);
      }
    });
    this.slimes.forEach((slime) => {
      const body = byId.get(slime.id);
      if (body) {
        slime.applySeparationX(body.x);
      }
    });
  }

  private pruneDeadSlimes() {
    this.slimes.forEach((slime, id) => {
      if (!slime.isDead) {
        return;
      }
      this.slimes.delete(id);
      this.removedEntityIds.push(id);
    });
  }

  private seededRng(entityId: string): () => number {
    let state =
      this.seed ^
      entityId.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    return () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 0x100000000;
    };
  }
}
