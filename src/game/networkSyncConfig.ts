export const remotePositionTolerancePx = 0.5;
export const remotePositionSnapDistancePx = 16;
export const networkPositionBackupIntervalMs = 1000;

/** Below this, client physics is left alone; server input ack only. */
export const physicsCorrectionThresholdPx = 8;

/** Above this, hard snap to authoritative physics before input replay. */
export const physicsHardSnapThresholdPx = 32;

/** Client runs the same separation pass as the server after locomotion fixed steps. */
export const entitySeparationRunsOnClient = true;
