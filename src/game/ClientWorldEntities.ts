import * as ex from "excalibur";
import { GameClient } from "../classes/GameClient";
import {
  messageTypes,
  type EntityPatch,
  type EntityState,
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

  public tickSlimeNetwork(frameDelta: number): void {
    this.slimes.forEach(({ slime }) => {
      slime.tickAuthority(frameDelta);
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
        this.applySlimeState(existing, state);
        return;
      }
      if (state.type !== "slime" || state.ownerId === undefined) {
        return;
      }
      this.spawnSlime(entityId, {
        type: "slime",
        ownerId: state.ownerId,
        ...state,
      });
    });
  }

  public applyEntityPatch(entityId: string, patch: EntityPatch): void {
    const existing = this.slimes.get(entityId);
    if (existing) {
      this.applySlimeState(existing, patch);
      return;
    }
    if (patch.type !== "slime" || patch.ownerId === undefined) {
      return;
    }
    this.spawnSlime(entityId, { type: "slime", ownerId: patch.ownerId, ...patch });
  }

  private spawnSlime(entityId: string, state: EntityState): void {
    const terrain = this.options.getTerrain();
    const dummyTileMap = this.options.getDummyTileMap();
    if (!terrain || !dummyTileMap) {
      return;
    }
    const x = state.x ?? 0;
    const y = state.y ?? 0;
    const isAuthority = state.ownerId === this.options.myPlayerId;
    const slime = new NetworkSlime(
      entityId,
      state.ownerId,
      ex.vec(x, y),
      dummyTileMap,
      terrain.tileCollisionWorld(),
      isAuthority ? this.options.client : undefined,
      isAuthority,
    );
    this.options.engine.add(slime);
    const entry = { slime };
    this.slimes.set(entityId, entry);
    this.registerSlimeCombat(slime);
    this.applySlimeState(entry, state);
  }

  private applySlimeState(entry: SlimeEntry, state: EntityPatch): void {
    entry.slime.applyCombatPatch(state);
    entry.slime.applyRemoteSimulation(state);
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

  private registerSlimeCombat(slime: NetworkSlime): void {
    this.options.worldLivingEntities.register({
      entityId: slime.entityId(),
      living: slime,
      onWeaponHit: (attacker) => {
        this.options.client.send({
          type: messageTypes.damageEntity,
          payload: {
            entityId: slime.entityId(),
            damage: 1,
            facingLeft: attacker.isFacingLeft(),
          },
        });
      },
    });
  }
}
