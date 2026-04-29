import * as ex from "excalibur";
import { Resources } from "../resource";
import type { TerrainTileKind } from "./GameProtocol";

type TerrainBlockOptions = {
  kind: TerrainTileKind;
  breakDurationMs: number;
  sprite: ex.ImageSource;
};

export class TerrainBlock {
  public readonly kind: TerrainTileKind;
  public readonly breakDurationMs: number;
  private readonly sprite: ex.ImageSource;

  constructor(options: TerrainBlockOptions) {
    this.kind = options.kind;
    this.breakDurationMs = options.breakDurationMs;
    this.sprite = options.sprite;
  }

  public toSprite() {
    return this.sprite.toSprite();
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
  stone: new TerrainBlock({
    kind: "stone",
    breakDurationMs: 720,
    sprite: Resources.Stone,
  }),
};

export const terrainBlockForKind = (kind: TerrainTileKind) =>
  terrainBlockByKind[kind];
