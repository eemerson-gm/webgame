import {
  wanderDecisionMaxMs,
  wanderDecisionMinMs,
} from "./simConfig.js";

const wanderChoices = [-1, 0, 1] as const;

const randomWanderSign = (rng: () => number) =>
  wanderChoices[Math.floor(rng() * wanderChoices.length)];

const randomWanderDelayMs = (rng: () => number) =>
  wanderDecisionMinMs +
  Math.floor(rng() * (wanderDecisionMaxMs - wanderDecisionMinMs));

/** Server-owned slime wander timing and direction. */
export class SlimeWanderController {
  public wanderSign = 0;
  public facingLeft = false;
  private wanderDecisionElapsedMs = 0;
  private wanderDecisionDelayMs: number;

  constructor(rng: () => number = Math.random) {
    this.wanderDecisionDelayMs = randomWanderDelayMs(rng);
  }

  public tickDecision(deltaMs: number, rng: () => number, isDead: boolean): void {
    if (isDead) {
      return;
    }
    this.wanderDecisionElapsedMs += deltaMs;
    if (this.wanderDecisionElapsedMs < this.wanderDecisionDelayMs) {
      return;
    }
    this.wanderDecisionElapsedMs = 0;
    this.wanderDecisionDelayMs = randomWanderDelayMs(rng);
    const nextSign = randomWanderSign(rng);
    if (nextSign === this.wanderSign) {
      return;
    }
    this.wanderSign = nextSign;
    if (nextSign < 0) {
      this.facingLeft = true;
    }
    if (nextSign > 0) {
      this.facingLeft = false;
    }
  }

  public applyAuthoritative(
    wanderSign: number | undefined,
    facingLeft: boolean | undefined,
    wanderDecisionElapsedMs?: number,
    wanderDecisionDelayMs?: number,
  ): void {
    if (wanderSign !== undefined) {
      this.wanderSign = wanderSign;
    }
    if (facingLeft !== undefined) {
      this.facingLeft = facingLeft;
    }
    if (wanderDecisionElapsedMs !== undefined) {
      this.wanderDecisionElapsedMs = wanderDecisionElapsedMs;
    }
    if (wanderDecisionDelayMs !== undefined) {
      this.wanderDecisionDelayMs = wanderDecisionDelayMs;
    }
  }

  public snapshotTiming(): {
    wanderDecisionElapsedMs: number;
    wanderDecisionDelayMs: number;
  } {
    return {
      wanderDecisionElapsedMs: this.wanderDecisionElapsedMs,
      wanderDecisionDelayMs: this.wanderDecisionDelayMs,
    };
  }
}
