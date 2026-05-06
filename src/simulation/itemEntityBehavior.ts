import type { ItemEntityState } from "../classes/GameProtocol";
import {
  applyGravity,
  stepEntityWithVelocity,
} from "./entityPhysics";
import type { CollisionBounds } from "./entityPhysics";
import type { EntitySimulationContext } from "./entitySimulation";

const itemSize = 8;
const itemGravity = 0.2;
const itemPositionScale = 100;
const itemAirFriction = 0.98;
const itemGroundFriction = 0.84;
const itemCollisionBounds: CollisionBounds = {
  offsetX: 0,
  offsetY: 0,
  width: itemSize,
  height: itemSize,
  edgeInset: 0.1,
};

export const stepItemEntity = (
  entity: ItemEntityState,
  context: EntitySimulationContext,
) => {
  const horizontalSpeed =
    entity.horizontalSpeed *
    (entity.isGrounded ? itemGroundFriction : itemAirFriction);
  const verticalSpeed = applyGravity(
    entity.verticalSpeed,
    itemGravity,
    context.dt,
  );
  const stepped = stepEntityWithVelocity(
    {
      x: entity.x,
      y: entity.y,
      horizontalSpeed,
      verticalSpeed,
      width: itemSize,
      height: itemSize,
      isGrounded: entity.isGrounded,
      isJumping: false,
    },
    {
      collisionBounds: itemCollisionBounds,
      world: context.world,
      positionScale: itemPositionScale,
      dt: context.dt,
    },
  );
  return {
    ...entity,
    x: stepped.x,
    y: stepped.y,
    horizontalSpeed: stepped.horizontalSpeed,
    verticalSpeed: stepped.verticalSpeed,
    isGrounded: stepped.isGrounded,
    isJumping: false,
  };
};
