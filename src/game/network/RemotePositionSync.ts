import * as ex from "excalibur";
import {
  remotePositionSnapDistancePx,
  remotePositionTolerancePx,
} from "../networkSyncConfig";

export type PositionSyncActor = {
  pos: ex.Vector;
  hspeed: number;
  vspeed: number;
};

export class RemotePositionSync {
  constructor(
    private readonly actor: PositionSyncActor,
    private readonly applyVisualCorrection: (
      position: ex.Vector,
      snapDistancePx: number,
      correctionOptions?: { forceHardSnap?: boolean },
    ) => void,
    private readonly afterSync?: () => void,
  ) {}

  public applyPartial(
    partial: { x?: number | string; y?: number | string },
    options?: {
      resetVelocity?: boolean;
      forceHardSnap?: boolean;
    },
  ): void {
    const hasX = partial.x !== undefined;
    const hasY = partial.y !== undefined;
    if (!hasX && !hasY) {
      return;
    }
    const nextX = hasX ? Number(partial.x) : this.actor.pos.x;
    const nextY = hasY ? Number(partial.y) : this.actor.pos.y;
    if (!Number.isFinite(nextX) || !Number.isFinite(nextY)) {
      return;
    }
    const target = ex.vec(nextX, nextY);
    if (this.actor.pos.distance(target) < remotePositionTolerancePx) {
      return;
    }
    if (options?.resetVelocity !== false) {
      this.actor.hspeed = 0;
      this.actor.vspeed = 0;
    }
    this.applyVisualCorrection(target, remotePositionSnapDistancePx, {
      forceHardSnap: options?.forceHardSnap,
    });
    this.afterSync?.();
  }
}
