import * as ex from "excalibur";
import { Resources } from "../resource";
import type { TerrainTileKind } from "./GameProtocol";

type TerrainBlockOptions = {
  kind: TerrainTileKind;
  breakDurationMs: number;
  sprite: ex.ImageSource;
  animationFrames?: ex.ImageSource[];
  animationFrameDurationMs?: number;
};

export class TerrainBlock {
  public readonly kind: TerrainTileKind;
  public readonly breakDurationMs: number;
  private readonly sprite: ex.ImageSource;
  private readonly animationFrames: ex.ImageSource[];
  private readonly animationFrameDurationMs: number;

  constructor(options: TerrainBlockOptions) {
    this.kind = options.kind;
    this.breakDurationMs = options.breakDurationMs;
    this.sprite = options.sprite;
    this.animationFrames = options.animationFrames ?? [];
    this.animationFrameDurationMs = options.animationFrameDurationMs ?? 120;
  }

  public toSprite() {
    return this.sprite.toSprite();
  }

  public toGraphic() {
    if (this.animationFrames.length === 0) {
      return this.toSprite();
    }
    return new ex.Animation({
      frames: this.animationFrames.map((image) => ({ graphic: image.toSprite() })),
      frameDuration: this.animationFrameDurationMs,
      strategy: ex.AnimationStrategy.Loop,
    });
  }

  public spriteSize() {
    const sprite = this.toSprite();
    return {
      width: sprite.width,
      height: sprite.height,
    };
  }

  public toSpriteFragment(x: number, y: number, width: number, height: number) {
    return new ex.Sprite({
      image: this.sprite,
      sourceView: {
        x,
        y,
        width,
        height,
      },
    });
  }
}

const terrainBlockByKind: Record<TerrainTileKind, TerrainBlock> = {
  bedrock: new TerrainBlock({
    kind: "bedrock",
    breakDurationMs: Number.POSITIVE_INFINITY,
    sprite: Resources.Bedrock,
  }),
  dirt: new TerrainBlock({
    kind: "dirt",
    breakDurationMs: 270,
    sprite: Resources.Dirt,
  }),
  grass: new TerrainBlock({
    kind: "grass",
    breakDurationMs: 270,
    sprite: Resources.Grass,
  }),
  lamp: new TerrainBlock({
    kind: "lamp",
    breakDurationMs: 360,
    sprite: Resources.Lamp,
  }),
  pillarBottom: new TerrainBlock({
    kind: "pillarBottom",
    breakDurationMs: Number.POSITIVE_INFINITY,
    sprite: Resources.PillarBottom,
  }),
  pillarMiddle: new TerrainBlock({
    kind: "pillarMiddle",
    breakDurationMs: Number.POSITIVE_INFINITY,
    sprite: Resources.PillarMiddle,
  }),
  pillarTop: new TerrainBlock({
    kind: "pillarTop",
    breakDurationMs: Number.POSITIVE_INFINITY,
    sprite: Resources.PillarTop,
  }),
  spawn: new TerrainBlock({
    kind: "spawn",
    breakDurationMs: Number.POSITIVE_INFINITY,
    sprite: Resources.Spawn,
  }),
  spawnOrb: new TerrainBlock({
    kind: "spawnOrb",
    breakDurationMs: Number.POSITIVE_INFINITY,
    sprite: Resources.SpawnOrb,
    animationFrames: [
      Resources.SpawnOrb1,
      Resources.SpawnOrb2,
      Resources.SpawnOrb3,
      Resources.SpawnOrb4,
      Resources.SpawnOrb5,
      Resources.SpawnOrb6,
      Resources.SpawnOrb7,
      Resources.SpawnOrb8,
    ],
    animationFrameDurationMs: 90,
  }),
  stone: new TerrainBlock({
    kind: "stone",
    breakDurationMs: 720,
    sprite: Resources.Stone,
  }),
};

export const terrainBlockForKind = (kind: TerrainTileKind) =>
  terrainBlockByKind[kind];
