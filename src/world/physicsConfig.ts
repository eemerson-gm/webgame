/** Fixed simulation rate for walking physics, entity separation, and per-step formulas. */
export const PHYSICS_TICK_HZ = 60;

export const physicsFixedStepMs = 1000 / PHYSICS_TICK_HZ;

/** Max frame delta fed into physics accumulators (~5 catch-up steps). */
export const physicsMaxFrameDeltaMs = physicsFixedStepMs * 5;
