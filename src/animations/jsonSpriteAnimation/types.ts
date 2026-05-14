export type JsonSpriteAnimationStrategy = "loop" | "freeze";

export type JsonSpritePose = {
  id: string;
  spriteKey: string;
  offset: {
    x: number;
    y: number;
  };
  rotationDeg: number;
  layer?: number;
  visible?: boolean;
};

export type JsonSpriteAnimationFrame = {
  sprites: readonly JsonSpritePose[];
};

export type JsonSpriteAnimationSpec = {
  frameDurationMs: number;
  strategy: JsonSpriteAnimationStrategy;
  mirrorWidth: number;
  frames: readonly JsonSpriteAnimationFrame[];
};

