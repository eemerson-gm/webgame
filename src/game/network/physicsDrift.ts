import {
  physicsCorrectionThresholdPx,
  physicsHardSnapThresholdPx,
} from "../networkSyncConfig";

export const physicsPositionError = (
  x: number,
  y: number,
  authoritativeX: number,
  authoritativeY: number,
): number => Math.hypot(authoritativeX - x, authoritativeY - y);

export const shouldCorrectPhysics = (errorPx: number): boolean =>
  errorPx >= physicsCorrectionThresholdPx;

export const shouldHardSnapPhysics = (errorPx: number): boolean =>
  errorPx >= physicsHardSnapThresholdPx;
