import * as ex from "excalibur";
import { remotePositionSnapDistancePx } from "../networkSyncConfig";
import {
  physicsPositionError,
  shouldCorrectPhysics,
  shouldHardSnapPhysics,
} from "./physicsDrift";

export type NetworkPositionSnapshot = {
  readonly x: number;
  readonly y: number;
  readonly horizontalSpeed?: number;
  readonly verticalSpeed?: number;
};

export interface NetworkCorrectionTarget {
  readonly pos: ex.Vector;
  hspeed: number;
  vspeed: number;
  applyPositionCorrection(
    position: ex.Vector,
    snapDistance: number,
    options?: { forceHardSnap?: boolean },
  ): void;
  syncPhysicsInterpolationToCurrentPosition?: () => void;
}

export class NetworkCorrectionController {
  constructor(private readonly target: NetworkCorrectionTarget) {}

  public applyServerCorrection(snapshot: NetworkPositionSnapshot): void {
    const error = physicsPositionError(
      this.target.pos.x,
      this.target.pos.y,
      snapshot.x,
      snapshot.y,
    );
    if (!shouldCorrectPhysics(error)) {
      return;
    }

    if (snapshot.horizontalSpeed !== undefined) {
      this.target.hspeed = snapshot.horizontalSpeed;
    }
    if (snapshot.verticalSpeed !== undefined) {
      this.target.vspeed = snapshot.verticalSpeed;
    }

    const forceHardSnap = shouldHardSnapPhysics(error);
    this.target.applyPositionCorrection(
      ex.vec(snapshot.x, snapshot.y),
      remotePositionSnapDistancePx,
      { forceHardSnap },
    );

    if (forceHardSnap) {
      this.target.syncPhysicsInterpolationToCurrentPosition?.();
    }
  }
}
