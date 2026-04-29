import * as ex from "excalibur";

type DynamicLightValue = number | (() => number);

type DynamicLightSourceOptions = {
  position: () => ex.Vector;
  radius?: DynamicLightValue;
  intensity?: DynamicLightValue;
  isEnabled?: () => boolean;
};

type ActorDynamicLightSourceOptions = {
  radius?: DynamicLightValue;
  intensity?: DynamicLightValue;
  offset?: ex.Vector;
  isEnabled?: () => boolean;
};

export type DynamicLightSnapshot = {
  position: ex.Vector;
  radius: number;
  intensity: number;
};

const defaultRadius = 96;
const defaultIntensity = 0.55;
const defaultOffset = ex.vec(0, 0);

const dynamicLightValue = (value: DynamicLightValue) =>
  typeof value === "function" ? value() : value;

export class DynamicLightSource {
  private readonly getPosition: () => ex.Vector;
  private readonly radius: DynamicLightValue;
  private readonly intensity: DynamicLightValue;
  private readonly getEnabled: () => boolean;

  constructor(options: DynamicLightSourceOptions) {
    this.getPosition = options.position;
    this.radius = options.radius ?? defaultRadius;
    this.intensity = options.intensity ?? defaultIntensity;
    this.getEnabled = options.isEnabled ?? (() => true);
  }

  public static forActor(
    actor: ex.Actor,
    options: ActorDynamicLightSourceOptions = {},
  ) {
    const offset = options.offset ?? defaultOffset;
    return new DynamicLightSource({
      radius: options.radius,
      intensity: options.intensity,
      isEnabled: options.isEnabled,
      position: () =>
        ex.vec(
          actor.pos.x + actor.width / 2 + offset.x,
          actor.pos.y + actor.height / 2 + offset.y,
        ),
    });
  }

  public snapshot(): DynamicLightSnapshot | null {
    if (!this.getEnabled()) {
      return null;
    }
    const radius = dynamicLightValue(this.radius);
    const intensity = dynamicLightValue(this.intensity);
    if (!Number.isFinite(radius) || radius <= 0) {
      return null;
    }
    if (!Number.isFinite(intensity) || intensity <= 0) {
      return null;
    }
    return {
      position: this.getPosition(),
      radius,
      intensity: Math.min(intensity, 1),
    };
  }
}
