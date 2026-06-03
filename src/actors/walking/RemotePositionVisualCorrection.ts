import * as ex from "excalibur";
import { remotePositionSnapDistancePx } from "../RemoteNetworkSync";

const remoteVisualCorrectionDurationMs = 120;

export type RemotePositionVisualCorrectionHost = {
  readonly actor: ex.Actor;
  getBaseDrawOffset: () => ex.Vector;
  onOffsetChanged: () => void;
  onHardSnap?: () => void;
};

export class RemotePositionVisualCorrection {
  private visualCorrectionOffset: ex.Vector = ex.vec(0, 0);
  private visualCorrectionStartOffset: ex.Vector = ex.vec(0, 0);
  private visualCorrectionElapsedMs: number = remoteVisualCorrectionDurationMs;

  constructor(private readonly host: RemotePositionVisualCorrectionHost) {}

  public correctionOffset(): ex.Vector {
    return this.visualCorrectionOffset;
  }

  public apply(
    position: ex.Vector,
    snapDistancePx: number = remotePositionSnapDistancePx,
    options?: { forceHardSnap?: boolean },
  ): void {
    const targetPos = ex.vec(position.x, position.y);
    const distance = this.host.actor.pos.distance(targetPos);
    if (distance < 0.001) {
      return;
    }
    if (options?.forceHardSnap || distance > snapDistancePx) {
      this.host.actor.pos = targetPos;
      this.resetVisualCorrection();
      this.host.onHardSnap?.();
      return;
    }
    const visualAnchor = this.host.actor.pos
      .add(this.host.getBaseDrawOffset())
      .add(this.visualCorrectionOffset);
    this.host.actor.pos = targetPos;
    const startOffset = visualAnchor.sub(
      this.host.actor.pos.add(this.host.getBaseDrawOffset()),
    );
    this.visualCorrectionStartOffset = startOffset;
    this.visualCorrectionElapsedMs = 0;
    this.applyVisualCorrectionOffset(startOffset);
  }

  public tick(delta: number): void {
    if (this.visualCorrectionElapsedMs >= remoteVisualCorrectionDurationMs) {
      return;
    }
    const elapsedMs = Math.min(
      this.visualCorrectionElapsedMs + delta,
      remoteVisualCorrectionDurationMs,
    );
    const remainingRatio = 1 - elapsedMs / remoteVisualCorrectionDurationMs;
    this.visualCorrectionElapsedMs = elapsedMs;
    this.applyVisualCorrectionOffset(
      this.visualCorrectionStartOffset.scale(remainingRatio),
    );
  }

  private resetVisualCorrection(): void {
    this.visualCorrectionStartOffset = ex.vec(0, 0);
    this.visualCorrectionElapsedMs = remoteVisualCorrectionDurationMs;
    this.applyVisualCorrectionOffset(ex.vec(0, 0));
  }

  private applyVisualCorrectionOffset(offset: ex.Vector): void {
    this.visualCorrectionOffset = offset;
    this.host.onOffsetChanged();
  }
}
