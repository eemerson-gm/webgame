const quantize = (value: number) => Math.round(value * 1000);

export type SimulationHashFields = {
  x: number;
  y: number;
  horizontalSpeed: number;
  verticalSpeed: number;
  isGrounded: boolean;
  isJumping: boolean;
  health?: number;
  wanderSign?: number;
  attackCycle?: number;
};

export type SimulationFieldDiff = {
  field: keyof SimulationHashFields;
  local: number | boolean | undefined;
  remote: number | boolean | undefined;
};

/** Quantized FNV-style hash for drift diagnostics. */
export const hashSimulationState = (fields: SimulationHashFields): number => {
  let hash = 2166136261;
  const mix = (value: number) => {
    hash ^= value;
    hash = Math.imul(hash, 16777619);
  };
  mix(quantize(fields.x));
  mix(quantize(fields.y));
  mix(quantize(fields.horizontalSpeed));
  mix(quantize(fields.verticalSpeed));
  mix(fields.isGrounded ? 1 : 0);
  mix(fields.isJumping ? 1 : 0);
  if (fields.health !== undefined) {
    mix(fields.health);
  }
  if (fields.wanderSign !== undefined) {
    mix(fields.wanderSign + 2);
  }
  if (fields.attackCycle !== undefined) {
    mix(fields.attackCycle);
  }
  return hash >>> 0;
};

export const firstSimulationFieldDiff = (
  local: SimulationHashFields,
  remote: SimulationHashFields,
): SimulationFieldDiff | null => {
  const keys: (keyof SimulationHashFields)[] = [
    "x",
    "y",
    "horizontalSpeed",
    "verticalSpeed",
    "isGrounded",
    "isJumping",
    "health",
    "wanderSign",
    "attackCycle",
  ];
  for (const field of keys) {
    const left = local[field];
    const right = remote[field];
    if (left === undefined && right === undefined) {
      continue;
    }
    if (typeof left === "number" && typeof right === "number") {
      if (quantize(left) !== quantize(right)) {
        return { field, local: left, remote: right };
      }
      continue;
    }
    if (left !== right) {
      return { field, local: left, remote: right };
    }
  }
  return null;
};
