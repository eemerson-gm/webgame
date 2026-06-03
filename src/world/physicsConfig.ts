/** Fixed simulation rate for walking physics and entity separation. */
export const PHYSICS_TICK_HZ = 30;

/** Reference rate used when normalizing per-step effects (e.g. knockback friction). */
export const PHYSICS_REFERENCE_HZ = 60;

export const physicsFixedStepMs = 1000 / PHYSICS_TICK_HZ;

/** Max frame delta fed into physics accumulators (~5 catch-up steps). */
export const physicsMaxFrameDeltaMs = physicsFixedStepMs * 5;
