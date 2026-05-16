export type GroundJabAttackPhase = "startup" | "active" | "recovery";

export type GroundJabMovementPhaseRules = {
  readonly horizontalPlant: boolean;
  readonly horizontalTargetMultiplier: number;
  readonly jumpAllowed: boolean;
};

const groundJabStartupEndNormalized = 0.35;
const groundJabActiveEndNormalized = 0.72;

export const resolveGroundJabAttackPhase = (
  elapsedMs: number,
  totalMs: number,
): GroundJabAttackPhase => {
  if (totalMs <= 0) {
    return "recovery";
  }
  const t = Math.min(Math.max(elapsedMs / totalMs, 0), 1);
  if (t < groundJabStartupEndNormalized) {
    return "startup";
  }
  if (t < groundJabActiveEndNormalized) {
    return "active";
  }
  return "recovery";
};

export const groundJabMovementRulesForPhase = (
  phase: GroundJabAttackPhase,
): GroundJabMovementPhaseRules => {
  if (phase === "startup") {
    return {
      horizontalPlant: false,
      horizontalTargetMultiplier: 0.38,
      jumpAllowed: true,
    };
  }
  if (phase === "active") {
    return {
      horizontalPlant: true,
      horizontalTargetMultiplier: 0,
      jumpAllowed: false,
    };
  }
  return {
    horizontalPlant: false,
    horizontalTargetMultiplier: 0.88,
    jumpAllowed: true,
  };
};
