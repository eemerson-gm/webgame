import type {
  EntityState,
  EntityType,
  PlayerState,
} from "../classes/GameProtocol";
import type { TileCollisionWorld } from "./entityPhysics";
import { stepSlimeEntity } from "./slimeEntityBehavior";

export type EntitySimulationContext = {
  playersData: Record<string, PlayerState>;
  world: TileCollisionWorld;
  dt: number;
};

type EntityBehavior = (
  entity: EntityState,
  context: EntitySimulationContext,
) => EntityState;

const entityBehaviorByType: Record<EntityType, EntityBehavior> = {
  slime: stepSlimeEntity,
};

export const stepEntities = (
  entitiesData: Record<string, EntityState>,
  context: EntitySimulationContext,
) => {
  return Object.fromEntries(
    Object.entries(entitiesData).map(([entityId, entity]) => [
      entityId,
      entityBehaviorByType[entity.type](entity, context),
    ]),
  );
};
