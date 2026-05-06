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

export type EntitySeparationBody = EntityPhysicsState & {
  id: string;
  collisionBounds: CollisionBounds;
  canSeparate: boolean;
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

export type EntitySeparationOptions = {
  world: TileCollisionWorld;
  padding: number;
  maxMoveX: number;
  passes: number;
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

export const separateEntityBodies = (
  bodies: EntitySeparationBody[],
  options: EntitySeparationOptions,
) => {
  return resolveSeparationPasses(bodies, options, options.passes);
};

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

const resolveSeparationPasses = (
  bodies: EntitySeparationBody[],
  options: EntitySeparationOptions,
  remainingPasses: number,
): EntitySeparationBody[] => {
  if (remainingPasses <= 0) {
    return bodies;
  }
  return resolveSeparationPasses(
    resolveSeparationPass(bodies, options),
    options,
    remainingPasses - 1,
  );
};

const resolveSeparationPass = (
  bodies: EntitySeparationBody[],
  options: EntitySeparationOptions,
) =>
  separationPairs(bodies).reduce(
    (currentBodies, pair) => separateBodyPair(currentBodies, pair, options),
    bodies,
  );

const separationPairs = (bodies: EntitySeparationBody[]) =>
  bodies.flatMap((_body, index) =>
    bodies
      .slice(index + 1)
      .map((_otherBody, offset) => [index, index + offset + 1] as const),
  );

const separateBodyPair = (
  bodies: EntitySeparationBody[],
  [leftIndex, rightIndex]: readonly [number, number],
  options: EntitySeparationOptions,
) => {
  const leftBody = bodies[leftIndex];
  const rightBody = bodies[rightIndex];
  if (!leftBody || !rightBody) {
    return bodies;
  }
  if (!shouldSeparateBodies(leftBody, rightBody, options.padding)) {
    return bodies;
  }
  const moves = separationMoves(leftBody, rightBody, options);
  return bodies.map((body, index) => {
    if (index === leftIndex) {
      return { ...body, x: body.x + moves.left };
    }
    if (index === rightIndex) {
      return { ...body, x: body.x + moves.right };
    }
    return body;
  });
};

const shouldSeparateBodies = (
  leftBody: EntitySeparationBody,
  rightBody: EntitySeparationBody,
  padding: number,
) => {
  if (!leftBody.canSeparate && !rightBody.canSeparate) {
    return false;
  }
  if (horizontalOverlap(leftBody, rightBody, padding) <= 0) {
    return false;
  }
  return verticalOverlap(leftBody, rightBody) > 0;
};

const separationMoves = (
  leftBody: EntitySeparationBody,
  rightBody: EntitySeparationBody,
  options: EntitySeparationOptions,
) => {
  const overlap = horizontalOverlap(leftBody, rightBody, options.padding);
  const direction = separationDirection(leftBody, rightBody);
  const movableCount =
    Number(leftBody.canSeparate) + Number(rightBody.canSeparate);
  const sharedMove = Math.min(overlap / movableCount, options.maxMoveX);
  const soloMove = Math.min(overlap, options.maxMoveX);
  const leftMove = leftBody.canSeparate
    ? safeSeparationMoveX(
        leftBody,
        direction * (rightBody.canSeparate ? sharedMove : soloMove),
        options,
      )
    : 0;
  const rightMove = rightBody.canSeparate
    ? safeSeparationMoveX(
        rightBody,
        -direction * (leftBody.canSeparate ? sharedMove : soloMove),
        options,
      )
    : 0;
  return {
    left: leftMove,
    right: rightMove,
  };
};

const separationDirection = (
  leftBody: EntitySeparationBody,
  rightBody: EntitySeparationBody,
) => {
  const centerDelta = entityCenterX(leftBody) - entityCenterX(rightBody);
  if (centerDelta !== 0) {
    return Math.sign(centerDelta);
  }
  return leftBody.id < rightBody.id ? -1 : 1;
};

const safeSeparationMoveX = (
  body: EntitySeparationBody,
  moveX: number,
  options: EntitySeparationOptions,
) => {
  const physicsOptions = {
    collisionBounds: body.collisionBounds,
    world: options.world,
  };
  const proposedX = body.x + moveX;
  const unclampedX = tileMeeting(proposedX, body.y, physicsOptions)
    ? body.x
    : proposedX;
  const bounded = stayInsideWorldBounds(
    {
      ...body,
      x: unclampedX,
    },
    physicsOptions,
  );
  return bounded.x - body.x;
};

const horizontalOverlap = (
  leftBody: EntitySeparationBody,
  rightBody: EntitySeparationBody,
  padding: number,
) =>
  Math.min(leftBody.x + leftBody.width, rightBody.x + rightBody.width) -
  Math.max(leftBody.x, rightBody.x) +
  padding;

const verticalOverlap = (
  leftBody: EntitySeparationBody,
  rightBody: EntitySeparationBody,
) =>
  Math.min(leftBody.y + leftBody.height, rightBody.y + rightBody.height) -
  Math.max(leftBody.y, rightBody.y);

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
