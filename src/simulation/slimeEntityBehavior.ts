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
import type {
  CollisionBounds,
  EntityPhysicsState,
  TileCollisionWorld,
} from "./entityPhysics";
import type { EntitySimulationContext } from "./entitySimulation";

type TargetPlayerState = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

type PathNode = {
  column: number;
  row: number;
};

type PathEntry = {
  node: PathNode;
  path: PathNode[];
};

type SlimePathStep = {
  horizontalSign: number;
  shouldJump: boolean;
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
const slimeChaseSpeed = 0.625;
const slimeChaseAcceleration = 0.25;
const slimeStopDistance = TILE_PX * 0.4;
const slimeJumpSpeed = -4;
const slimeFriction = 0.9;
const maxPathSearchNodes = 128;
const pathVerticalOffsets = [0, -1, -2, -3, 1, 2, 3];
const pathHorizontalOffsets = [-1, 1];
const standNodeVerticalOffsets = [0, 1, 2, 3, -1, -2, -3];

export const stepSlimeEntity = (
  entity: EntityState,
  context: EntitySimulationContext,
) => {
  const target = nearestTargetPlayer(entity, context.playersData);
  const pathStep = slimePathStep(entity, target, context);
  const horizontalSign = pathStep.horizontalSign;
  const isKnockedBack = entity.knockbackMs > 0;
  const knockbackMs = Math.max(entity.knockbackMs - context.dt * 1000, 0);
  const horizontalSpeed = isKnockedBack
    ? entity.horizontalSpeed * slimeFriction
    : slimeHorizontalSpeed(entity, target, horizontalSign, context.dt);
  const shouldJump = !isKnockedBack && shouldSlimeJump(
    entity,
    target,
    pathStep,
    context,
  );
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
  pathStep: SlimePathStep,
  context: EntitySimulationContext,
) => {
  if (!entity.isGrounded) {
    return false;
  }
  if (!target) {
    return false;
  }
  if (pathStep.shouldJump) {
    return true;
  }
  if (pathStep.horizontalSign === 0) {
    return false;
  }
  return tileMeeting(entity.x + pathStep.horizontalSign * 2, entity.y, {
    collisionBounds: slimeCollisionBounds,
    world: context.world,
  });
};

const slimePathStep = (
  entity: EntityState,
  target: TargetPlayerState | null,
  context: EntitySimulationContext,
): SlimePathStep => {
  if (!target) {
    return {
      horizontalSign: 0,
      shouldJump: false,
    };
  }
  const path = slimePathToTarget(entity, target, context.world);
  const start = path[0];
  const next = path[1];
  const directHorizontalSign = horizontalSignBetween(slimeBody(entity), target);
  if (!start || !next) {
    return {
      horizontalSign: directHorizontalSign,
      shouldJump: false,
    };
  }
  const horizontalSign = Math.sign(next.column - start.column);
  return {
    horizontalSign: horizontalSign === 0 ? directHorizontalSign : horizontalSign,
    shouldJump: next.row < start.row,
  };
};

const slimePathToTarget = (
  entity: EntityState,
  target: TargetPlayerState,
  world: TileCollisionWorld,
) => {
  const start = standNodeNear(slimeBody(entity), world);
  const goal = standNodeNear(target, world);
  if (!start || !goal) {
    return [];
  }
  return findPath(
    [{ node: start, path: [start] }],
    new Set([pathNodeKey(start)]),
    goal,
    world,
    0,
    [start],
  );
};

const findPath = (
  queue: PathEntry[],
  visited: Set<string>,
  goal: PathNode,
  world: TileCollisionWorld,
  searchedNodes: number,
  bestPath: PathNode[],
): PathNode[] => {
  const current = queue[0];
  if (!current) {
    return bestPath;
  }
  if (samePathNode(current.node, goal)) {
    return current.path;
  }
  if (searchedNodes >= maxPathSearchNodes) {
    return bestPath;
  }
  const nextBestPath =
    pathNodeDistance(current.node, goal) <
    pathNodeDistance(bestPath.at(-1) ?? current.node, goal)
      ? current.path
      : bestPath;
  const nextNodes = pathNeighbors(current.node, world).filter((node) => {
    const key = pathNodeKey(node);
    if (visited.has(key)) {
      return false;
    }
    visited.add(key);
    return true;
  });
  const nextEntries = nextNodes.map((node) => ({
    node,
    path: [...current.path, node],
  }));
  return findPath(
    [...queue.slice(1), ...nextEntries],
    visited,
    goal,
    world,
    searchedNodes + 1,
    nextBestPath,
  );
};

const pathNeighbors = (node: PathNode, world: TileCollisionWorld) =>
  pathHorizontalOffsets
    .flatMap((columnOffset) =>
      pathVerticalOffsets.map((rowOffset) => ({
        column: node.column + columnOffset,
        row: node.row + rowOffset,
      })),
    )
    .filter((neighbor) => isReachableStandNode(node, neighbor, world));

const isReachableStandNode = (
  from: PathNode,
  to: PathNode,
  world: TileCollisionWorld,
) => {
  if (!isStandNode(to, world)) {
    return false;
  }
  if (to.row < from.row - 3) {
    return false;
  }
  return to.row <= from.row + 3;
};

const standNodeNear = (
  entity: Pick<EntityPhysicsState, "x" | "y" | "width" | "height">,
  world: TileCollisionWorld,
) => {
  const column = Math.floor(entityCenterX(entity) / world.tileWidth);
  const row = Math.floor((entity.y + entity.height) / world.tileHeight);
  return standNodeVerticalOffsets
    .map((rowOffset) => ({
      column,
      row: row + rowOffset,
    }))
    .find((node) => isStandNode(node, world));
};

const isStandNode = (node: PathNode, world: TileCollisionWorld) => {
  if (node.column < 0 || node.column >= world.columns) {
    return false;
  }
  if (node.row <= 0 || node.row >= world.rows) {
    return false;
  }
  if (!world.isSolidTile(node.column, node.row)) {
    return false;
  }
  return !world.isSolidTile(node.column, node.row - 1);
};

const samePathNode = (a: PathNode, b: PathNode) =>
  a.column === b.column && a.row === b.row;

const pathNodeKey = (node: PathNode) => `${node.column},${node.row}`;

const pathNodeDistance = (a: PathNode, b: PathNode) =>
  Math.abs(a.column - b.column) + Math.abs(a.row - b.row);

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
