import type {
  EntityState,
  PlayerState,
} from "../classes/GameProtocol";
import type { TileCollisionWorld } from "./entityPhysics";
import { stepItemEntity } from "./itemEntityBehavior";
import { stepSlimeEntity } from "./slimeEntityBehavior";

export type EntitySimulationContext = {
  playersData: Record<string, PlayerState>;
  world: TileCollisionWorld;
  dt: number;
};

const stepEntity = (entity: EntityState, context: EntitySimulationContext) => {
  if (entity.type === "item") {
    return stepItemEntity(entity, context);
  }
  return stepSlimeEntity(entity, context);
};

export const stepEntities = (
  entitiesData: Record<string, EntityState>,
  context: EntitySimulationContext,
) => {
  return Object.fromEntries(
    Object.entries(entitiesData).map(([entityId, entity]) => [
      entityId,
      stepEntity(entity, context),
    ]),
  );
};
