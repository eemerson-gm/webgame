import { physicsFixedStepMs } from "../../world/physicsConfig.js";

/** Accumulates frame time and invokes a fixed-step callback (same cadence client/server). */
export class FixedStepRunner {
  private accumulatorMs = 0;

  constructor(private readonly stepMs: number = physicsFixedStepMs) {}

  reset(): void {
    this.accumulatorMs = 0;
  }

  /** @returns how many fixed steps ran this frame */
  runFrame(deltaMs: number, step: (stepMs: number) => void): number {
    this.accumulatorMs += deltaMs;
    let steps = 0;
    while (this.accumulatorMs >= this.stepMs) {
      this.accumulatorMs -= this.stepMs;
      step(this.stepMs);
      steps += 1;
    }
    return steps;
  }
}
