import type { EntityState, PlayerState } from "../classes/GameProtocol";
import { TILE_PX } from "../world/worldConfig";
import {
  applyGravity,
  entityCenterX,
  entityCenterY,
  horizontalSignBetween,
  stepEntityWithVelocity,
  tileMeeting,
} from "./entityPhysics";
import type { CollisionBounds, EntityPhysicsState } from "./entityPhysics";
import type { EntitySimulationContext } from "./entitySimulation";

type TargetPlayerState = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

const slimeCollisionBounds: CollisionBounds = {
  offsetX: 2,
  offsetY: 4,
  width: TILE_PX - 4,
  height: TILE_PX - 4,
  edgeInset: 0.1,
};
const slimeWidth = TILE_PX;
const slimeHeight = TILE_PX;
const slimeGravity = 0.2;
const slimePositionScale = 100;
const slimeChaseSpeed = 1.25;
const slimeChaseAcceleration = 0.25;
const slimeStopDistance = TILE_PX * 0.4;
const slimeJumpSpeed = -4;
const slimeFriction = 0.9;

export const stepSlimeEntity = (
  entity: EntityState,
  context: EntitySimulationContext,
) => {
  const target = nearestTargetPlayer(entity, context.playersData);
  const body = slimeBody(entity);
  const horizontalSign = target ? horizontalSignBetween(body, target) : 0;
  const isKnockedBack = entity.knockbackMs > 0;
  const knockbackMs = Math.max(entity.knockbackMs - context.dt * 1000, 0);
  const horizontalSpeed = isKnockedBack
    ? entity.horizontalSpeed * slimeFriction
    : slimeHorizontalSpeed(entity, target, horizontalSign, context.dt);
  const shouldJump =
    !isKnockedBack && shouldSlimeJump(entity, target, horizontalSign, context);
  const verticalSpeed = shouldJump
    ? slimeJumpSpeed
    : applyGravity(entity.verticalSpeed, slimeGravity, context.dt);
  const stepped = stepEntityWithVelocity(
    {
      x: entity.x,
      y: entity.y,
      horizontalSpeed,
      verticalSpeed,
      width: slimeWidth,
      height: slimeHeight,
      isGrounded: entity.isGrounded,
      isJumping: shouldJump || entity.isJumping,
    },
    {
      collisionBounds: slimeCollisionBounds,
      world: context.world,
      positionScale: slimePositionScale,
      dt: context.dt,
    },
  );
  return {
    ...entity,
    x: stepped.x,
    y: stepped.y,
    horizontalSpeed: stepped.horizontalSpeed,
    verticalSpeed: stepped.verticalSpeed,
    facingLeft: facingLeftAfterStep(entity, horizontalSign),
    isGrounded: stepped.isGrounded,
    isJumping: stepped.isJumping,
    knockbackMs,
    targetPlayerId: target?.id,
  };
};

const slimeHorizontalSpeed = (
  entity: EntityState,
  target: TargetPlayerState | null,
  horizontalSign: number,
  dt: number,
) => {
  if (!target) {
    return entity.horizontalSpeed * slimeFriction;
  }
  const distanceX = entityCenterX(target) - entityCenterX(slimeBody(entity));
  const targetSpeed =
    Math.abs(distanceX) <= slimeStopDistance
      ? 0
      : horizontalSign * slimeChaseSpeed;
  return approach(
    entity.horizontalSpeed,
    targetSpeed,
    slimeChaseAcceleration * 60 * dt,
  );
};

const shouldSlimeJump = (
  entity: EntityState,
  target: TargetPlayerState | null,
  horizontalSign: number,
  context: EntitySimulationContext,
) => {
  if (!entity.isGrounded) {
    return false;
  }
  if (!target) {
    return false;
  }
  if (entityCenterY(target) < entityCenterY(slimeBody(entity)) - TILE_PX * 0.5) {
    return true;
  }
  if (horizontalSign === 0) {
    return false;
  }
  return tileMeeting(entity.x + horizontalSign * 2, entity.y, {
    collisionBounds: slimeCollisionBounds,
    world: context.world,
  });
};

const facingLeftAfterStep = (entity: EntityState, horizontalSign: number) => {
  if (horizontalSign === 0) {
    return entity.facingLeft;
  }
  return horizontalSign === -1;
};

const nearestTargetPlayer = (
  entity: EntityState,
  playersData: Record<string, PlayerState>,
) => {
  const targets = Object.entries(playersData)
    .map(([id, player]) => targetPlayerFromState(id, player))
    .filter((player): player is TargetPlayerState => !!player);
  return targets.reduce<TargetPlayerState | null>((nearest, player) => {
    if (!nearest) {
      return player;
    }
    return distanceBetween(slimeBody(entity), player) <
      distanceBetween(slimeBody(entity), nearest)
      ? player
      : nearest;
  }, null);
};

const slimeBody = (entity: EntityState) => ({
  x: entity.x,
  y: entity.y,
  width: slimeWidth,
  height: slimeHeight,
});

const targetPlayerFromState = (
  id: string,
  player: PlayerState,
): TargetPlayerState | null => {
  const x = Number(player.x);
  const y = Number(player.y);
  if (player.isPaused) {
    return null;
  }
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }
  return {
    id,
    x,
    y,
    width: TILE_PX,
    height: TILE_PX,
  };
};

const distanceBetween = (
  entity: Pick<EntityPhysicsState, "x" | "y" | "width" | "height">,
  target: Pick<EntityPhysicsState, "x" | "y" | "width" | "height">,
) => {
  return Math.hypot(
    entityCenterX(target) - entityCenterX(entity),
    entityCenterY(target) - entityCenterY(entity),
  );
};

const approach = (start: number, end: number, amount: number) => {
  if (start < end) {
    return Math.min(start + amount, end);
  }
  return Math.max(start - amount, end);
};
