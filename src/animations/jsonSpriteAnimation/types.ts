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
  pixelDataUrl?: string;
};

export type JsonSpriteAnimationFrame = {
  sprites: readonly JsonSpritePose[];
  overlayPixelDataUrl?: string;
  overlayVisible?: boolean;
};

export type JsonSpriteAnimationSpec = {
  frameDurationMs: number;
  speed?: number;
  mirrorWidth: number;
  frames: readonly JsonSpriteAnimationFrame[];
};

