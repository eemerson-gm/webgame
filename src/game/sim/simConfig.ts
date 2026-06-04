import { TILE_PX } from "../../world/worldConfig";
import type { CollisionBounds, WalkingTuning } from "../../physics/entityPhysics";

export type { WalkingTuning };

export type LivingVitality = {
  maxHealth: number;
  damageImmunityDurationMs: number;
  damageBlinkFrameMs: number;
};

export type LivingKnockback = {
  horizontalSpeed: number;
  verticalSpeed: number;
  durationMs: number;
  friction: number;
};

const collisionWidth = TILE_PX - 4;
const collisionHeight = TILE_PX - 2;

export const simCollisionBounds: CollisionBounds = {
  offsetX: TILE_PX / 2 - collisionWidth / 2,
  offsetY: TILE_PX - collisionHeight,
  width: collisionWidth,
  height: collisionHeight,
  edgeInset: 0.1,
};

export const simEntityWidth = TILE_PX;
export const simEntityHeight = TILE_PX;

export const playerWalkingTuning: WalkingTuning = {
  walkSpeed: 1.2,
  walkAcceleration: 0.25,
  stopDeceleration: 0.22,
  turnAcceleration: 0.32,
  gravity: 0.2,
  jumpSpeed: -2.8,
  positionScale: 100,
};

export const slimeWalkingTuning: WalkingTuning = {
  walkSpeed: 0.55,
  walkAcceleration: 0.15,
  stopDeceleration: 0.14,
  turnAcceleration: 0.2,
  gravity: 0.2,
  jumpSpeed: -2.6,
  positionScale: 100,
};

export const playerVitality: LivingVitality = {
  maxHealth: 6,
  damageImmunityDurationMs: 500,
  damageBlinkFrameMs: 90,
};

export const slimeVitality: LivingVitality = {
  maxHealth: 3,
  damageImmunityDurationMs: 500,
  damageBlinkFrameMs: 90,
};

export const defaultKnockback: LivingKnockback = {
  horizontalSpeed: 2.2,
  verticalSpeed: -1.4,
  durationMs: 240,
  friction: 0.94,
};

export const playerJumpHoldDurationMs = 220;
export const jumpHeldGravityMultiplier = 0.3;
export const jumpReleasedGravityMultiplier = 1.15;
export const jumpFallGravityMultiplier = 0.85;

export const wanderDecisionMinMs = 1200;
export const wanderDecisionMaxMs = 2000;

export const entitySeparationPadding = 1;
export const entitySeparationMaxMoveX = 0.3;
export const entitySeparationPasses = 2;

/** Server broadcasts snapshots every N physics ticks (~20 Hz at 60 Hz sim). */
export const snapshotIntervalTicks = 3;

export const swordAttackDurationMs = 350;
export const swordHitMinElapsedRatio = 0.1;

export const serverWeaponReachX = 14;
export const serverWeaponReachY = 10;
