import * as ex from "excalibur";
import { Slime } from "../actors/Slime";
import { GameClient } from "../classes/GameClient";
import {
  messageTypes,
  type EntityPatch,
  type EntityState,
} from "../classes/GameWire";
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

  private applySlimeState(slime: Slime, state: EntityPatch): void {
    slime.applyCombatPatch(state);
    if (slime.hasAuthority()) {
      return;
    }
    slime.applyRemoteSimulation(state);
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
