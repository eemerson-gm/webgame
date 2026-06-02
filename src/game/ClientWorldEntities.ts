import * as ex from "excalibur";
import { Slime } from "../actors/Slime";
import { GameClient } from "../classes/GameClient";
import { messageTypes, type EntityState } from "../classes/GameWire";
import type { ClientWorldLivingEntities } from "./ClientWorldLivingEntities";
import type { TerrainTileMap } from "../classes/TerrainTileMap";

type ClientWorldEntitiesOptions = {
  engine: ex.Engine;
  client: GameClient;
  myPlayerId: string;
  getTerrain: () => TerrainTileMap | null;
  getDummyTileMap: () => ex.TileMap | null;
  worldLivingEntities: ClientWorldLivingEntities;
};

export class ClientWorldEntities {
  private readonly slimes: Map<string, Slime> = new Map();

  constructor(private readonly options: ClientWorldEntitiesOptions) {}

  public applyEntitiesSnapshot(payload: {
    entitiesData?: Record<string, EntityState>;
    removedEntityIds?: string[];
  }): void {
    payload.removedEntityIds?.forEach((entityId) => {
      this.removeSlime(entityId);
    });
    if (!payload.entitiesData) {
      return;
    }
    Object.entries(payload.entitiesData).forEach(([entityId, state]) => {
      if (state.type !== "slime") {
        return;
      }
      const existing = this.slimes.get(entityId);
      if (existing) {
        this.applySlimeState(existing, state);
        return;
      }
      this.spawnSlime(entityId, state);
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
    const slime = new Slime(
      entityId,
      state.ownerId,
      this.options.myPlayerId,
      ex.vec(x, y),
      dummyTileMap,
      terrain.tileCollisionWorld(),
      this.options.client,
    );
    this.options.engine.add(slime);
    this.slimes.set(entityId, slime);
    this.registerSlimeCombat(slime);
    this.applySlimeState(slime, state);
  }

  private applySlimeState(slime: Slime, state: EntityState): void {
    if (slime.hasAuthority()) {
      if (state.health !== undefined) {
        slime.syncHealth(state.health);
      }
      return;
    }
    slime.applyRemoteUpdate(state);
  }

  private removeSlime(entityId: string): void {
    const slime = this.slimes.get(entityId);
    if (!slime) {
      return;
    }
    this.options.worldLivingEntities.unregister(entityId);
    slime.kill();
    this.slimes.delete(entityId);
  }

  private registerSlimeCombat(slime: Slime): void {
    this.options.worldLivingEntities.register({
      entityId: slime.entityId(),
      living: slime,
      onWeaponHit: () => {
        this.options.client.send({
          type: messageTypes.damageEntity,
          payload: {
            entityId: slime.entityId(),
            damage: 1,
          },
        });
      },
    });
  }
}
