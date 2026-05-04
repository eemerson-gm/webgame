export type CollisionBounds = {
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  edgeInset: number;
};

export type WorldBounds = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export type EntityPhysicsState = {
  x: number;
  y: number;
  horizontalSpeed: number;
  verticalSpeed: number;
  width: number;
  height: number;
  isGrounded: boolean;
  isJumping: boolean;
};

export type TileCollisionWorld = {
  tileWidth: number;
  tileHeight: number;
  columns: number;
  rows: number;
  isSolidTile: (column: number, row: number) => boolean;
};

export type EntityPhysicsOptions = {
  collisionBounds: CollisionBounds;
  world: TileCollisionWorld;
};

export type EntityStepOptions = EntityPhysicsOptions & {
  positionScale: number;
  dt: number;
};

export const applyGravity = (
  verticalSpeed: number,
  gravity: number,
  dt: number,
) => verticalSpeed + gravity * 60 * dt;

export const overlapsWorldBounds = (
  entity: Pick<EntityPhysicsState, "x" | "y" | "width" | "height">,
  bounds: WorldBounds,
) => {
  if (entity.x + entity.width <= bounds.left) {
    return false;
  }
  if (entity.x >= bounds.right) {
    return false;
  }
  if (entity.y + entity.height <= bounds.top) {
    return false;
  }
  return entity.y < bounds.bottom;
};

export const entityCenterX = (
  entity: Pick<EntityPhysicsState, "x" | "width">,
) => entity.x + entity.width / 2;

export const entityCenterY = (
  entity: Pick<EntityPhysicsState, "y" | "height">,
) => entity.y + entity.height / 2;

export const horizontalSignBetween = (
  from: Pick<EntityPhysicsState, "x" | "width">,
  to: Pick<EntityPhysicsState, "x" | "width">,
) => Math.sign(entityCenterX(to) - entityCenterX(from));

export const tileMeeting = (
  x: number,
  y: number,
  { collisionBounds, world }: EntityPhysicsOptions,
) => {
  return collisionTilePositionsAt(x, y, collisionBounds, world).some(
    ([column, row]) => world.isSolidTile(column, row),
  );
};

export const moveHorizontallyUntilBlocked = (
  x: number,
  y: number,
  moveX: number,
  options: EntityPhysicsOptions,
) => {
  if (moveX === 0) {
    return { x, isBlocked: false };
  }
  if (!tileMeeting(x + moveX, y, options)) {
    return { x: x + moveX, isBlocked: false };
  }
  return {
    x: nudgeXUntilBlocked(x, y, moveX, options),
    isBlocked: true,
  };
};

export const moveVerticallyUntilBlocked = (
  x: number,
  y: number,
  moveY: number,
  options: EntityPhysicsOptions,
) => {
  if (moveY === 0) {
    return { y, isBlocked: false };
  }
  if (!tileMeeting(x, y + moveY, options)) {
    return { y: y + moveY, isBlocked: false };
  }
  return {
    y: nudgeYUntilBlocked(x, y, moveY, options),
    isBlocked: true,
  };
};

export const stayInsideWorldBounds = (
  entity: EntityPhysicsState,
  { collisionBounds, world }: EntityPhysicsOptions,
) => {
  const worldWidth = world.columns * world.tileWidth;
  const worldHeight = world.rows * world.tileHeight;
  const minX = -collisionBounds.offsetX;
  const maxX = worldWidth - collisionBounds.offsetX - collisionBounds.width;
  const minY = -collisionBounds.offsetY;
  const maxY = worldHeight - collisionBounds.offsetY - collisionBounds.height;
  const clampedX = Math.min(Math.max(entity.x, minX), maxX);
  const clampedY = Math.min(Math.max(entity.y, minY), maxY);
  return {
    ...entity,
    x: clampedX,
    y: clampedY,
    horizontalSpeed: clampedX !== entity.x ? 0 : entity.horizontalSpeed,
    verticalSpeed: clampedY !== entity.y ? 0 : entity.verticalSpeed,
  };
};

export const stepEntityWithVelocity = (
  entity: EntityPhysicsState,
  options: EntityStepOptions,
) => {
  const moveX = entity.horizontalSpeed * options.positionScale * options.dt;
  const moveY = entity.verticalSpeed * options.positionScale * options.dt;
  const horizontalMove = moveHorizontallyUntilBlocked(
    entity.x,
    entity.y,
    moveX,
    options,
  );
  const afterHorizontalMove = {
    ...entity,
    x: horizontalMove.x,
    horizontalSpeed: horizontalMove.isBlocked ? 0 : entity.horizontalSpeed,
  };
  const verticalMove = moveVerticallyUntilBlocked(
    afterHorizontalMove.x,
    afterHorizontalMove.y,
    moveY,
    options,
  );
  const afterVerticalMove = {
    ...afterHorizontalMove,
    y: verticalMove.y,
    verticalSpeed: verticalMove.isBlocked ? 0 : afterHorizontalMove.verticalSpeed,
  };
  const bounded = stayInsideWorldBounds(afterVerticalMove, options);
  const isGrounded = tileMeeting(bounded.x, bounded.y + 1, options);
  return {
    ...bounded,
    isGrounded,
    isJumping: isGrounded ? false : bounded.isJumping,
  };
};

export const stepEntityFreely = (
  entity: EntityPhysicsState,
  options: EntityStepOptions,
) => {
  return stayInsideWorldBounds(
    {
      ...entity,
      x: entity.x + entity.horizontalSpeed * options.positionScale * options.dt,
      y: entity.y + entity.verticalSpeed * options.positionScale * options.dt,
      isGrounded: false,
    },
    options,
  );
};

const collisionTilePositionsAt = (
  x: number,
  y: number,
  collisionBounds: CollisionBounds,
  world: TileCollisionWorld,
) => {
  const bounds = {
    left: x + collisionBounds.offsetX,
    right: x + collisionBounds.offsetX + collisionBounds.width - collisionBounds.edgeInset,
    top: y + collisionBounds.offsetY,
    bottom:
      y + collisionBounds.offsetY + collisionBounds.height - collisionBounds.edgeInset,
  };
  return [
    [bounds.left, bounds.top],
    [bounds.right, bounds.top],
    [bounds.left, bounds.bottom],
    [bounds.right, bounds.bottom],
  ].map(([worldX, worldY]) => [
    Math.floor(worldX / world.tileWidth),
    Math.floor(worldY / world.tileHeight),
  ]);
};

const nudgeXUntilBlocked = (
  x: number,
  y: number,
  moveX: number,
  options: EntityPhysicsOptions,
) => {
  const direction = Math.sign(moveX);
  const nudge = (currentX: number, remaining: number): number => {
    if (remaining <= 0) {
      return currentX;
    }
    if (tileMeeting(currentX + direction, y, options)) {
      return currentX;
    }
    return nudge(currentX + direction, remaining - 1);
  };
  return nudge(x, options.world.tileWidth);
};

const nudgeYUntilBlocked = (
  x: number,
  y: number,
  moveY: number,
  options: EntityPhysicsOptions,
) => {
  const direction = Math.sign(moveY);
  const nudge = (currentY: number, remaining: number): number => {
    if (remaining <= 0) {
      return currentY;
    }
    if (tileMeeting(x, currentY + direction, options)) {
      return currentY;
    }
    return nudge(currentY + direction, remaining - 1);
  };
  return nudge(y, options.world.tileHeight);
};
