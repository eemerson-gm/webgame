import * as ex from "excalibur";
import { GameClient } from "../classes/GameClient";
import type {
  AuthoritativeEntitySnapshot,
  EntityPatch,
  EntityState,
  WorldSnapshotPayload,
} from "../classes/GameWire";
import type { ClientWorldLivingEntities } from "./ClientWorldLivingEntities";
import type { TerrainTileMap } from "../classes/TerrainTileMap";
import { NetworkSlime } from "./network/NetworkSlime";

type ClientWorldEntitiesOptions = {
  engine: ex.Engine;
  client: GameClient;
  myPlayerId: string;
  getTerrain: () => TerrainTileMap | null;
  getDummyTileMap: () => ex.TileMap | null;
  worldLivingEntities: ClientWorldLivingEntities;
};

type SlimeEntry = {
  slime: NetworkSlime;
};

export class ClientWorldEntities {
  private readonly slimes: Map<string, SlimeEntry> = new Map();

  constructor(private readonly options: ClientWorldEntitiesOptions) {}

  public applyWorldSnapshot(snapshot: WorldSnapshotPayload): void {
    snapshot.removedEntityIds?.forEach((entityId) => {
      this.removeSlime(entityId);
    });
    Object.entries(snapshot.entities).forEach(([entityId, state]) => {
      const existing = this.slimes.get(entityId);
      if (existing) {
        existing.slime.applyWorldSnapshotTick(snapshot.tick);
        existing.slime.applyAuthoritativeSnapshot(state);
        return;
      }
      if (state.type !== "slime" || state.ownerId === undefined) {
        return;
      }
      this.spawnSlime(entityId, {
        ...state,
        type: "slime",
        ownerId: state.ownerId,
      });
    });
  }

  public applyEntitiesSnapshot(payload: {
    entitiesData?: Record<string, EntityPatch>;
    removedEntityIds?: string[];
  }): void {
    payload.removedEntityIds?.forEach((entityId) => {
      this.removeSlime(entityId);
    });
    if (!payload.entitiesData) {
      return;
    }
    Object.entries(payload.entitiesData).forEach(([entityId, state]) => {
      const existing = this.slimes.get(entityId);
      if (existing) {
        existing.slime.applyAuthoritativeSnapshot(
          state as AuthoritativeEntitySnapshot,
        );
        return;
      }
      if (state.type !== "slime" || state.ownerId === undefined) {
        return;
      }
      this.spawnSlime(entityId, {
        ...state,
        type: "slime",
        ownerId: state.ownerId,
      });
    });
  }

  public applyEntityPatch(entityId: string, patch: EntityPatch): void {
    const existing = this.slimes.get(entityId);
    if (existing) {
      existing.slime.applyAuthoritativeSnapshot(
        patch as AuthoritativeEntitySnapshot,
      );
      return;
    }
    if (patch.type !== "slime" || patch.ownerId === undefined) {
      return;
    }
    this.spawnSlime(entityId, {
      ...patch,
      type: "slime",
      ownerId: patch.ownerId,
    });
  }

  private spawnSlime(entityId: string, state: EntityState): void {
    const terrain = this.options.getTerrain();
    const dummyTileMap = this.options.getDummyTileMap();
    if (!terrain || !dummyTileMap) {
      return;
    }
    const x = state.x ?? 0;
    const y = state.y ?? 0;
    const slime = new NetworkSlime(
      entityId,
      state.ownerId,
      ex.vec(x, y),
      dummyTileMap,
      terrain.tileCollisionWorld(),
    );
    this.options.engine.add(slime);
    this.options.worldLivingEntities.register({
      entityId,
      living: slime,
      onWeaponHit: () => {},
    });
    const entry = { slime };
    this.slimes.set(entityId, entry);
    slime.applyAuthoritativeSnapshot(state as AuthoritativeEntitySnapshot);
  }

  private removeSlime(entityId: string): void {
    const entry = this.slimes.get(entityId);
    if (!entry) {
      return;
    }
    this.options.worldLivingEntities.unregister(entityId);
    entry.slime.kill();
    this.slimes.delete(entityId);
  }
}
