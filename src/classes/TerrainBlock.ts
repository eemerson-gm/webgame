import * as ex from "excalibur";
import { Resources } from "../resource";
import type { TerrainTileKind } from "./GameProtocol";
import type { PlayerPowerup } from "./Powerups";
import { terrainBlockDropsForKind } from "./TerrainBlockDrops";

type TerrainBlockOptions = {
  kind: TerrainTileKind;
  health: number | null;
  regenPerSecond?: number;
  sprite: ex.ImageSource;
  animationFrames?: ex.ImageSource[];
  animationFrameDurationMs?: number;
};

export class TerrainBlock {
  public readonly kind: TerrainTileKind;
  public readonly health: number | null;
  public readonly regenPerSecond: number;
  private readonly sprite: ex.ImageSource;
  private readonly animationFrames: ex.ImageSource[];
  private readonly animationFrameDurationMs: number;

  constructor(options: TerrainBlockOptions) {
    this.kind = options.kind;
    this.health = options.health;
    this.regenPerSecond = options.regenPerSecond ?? options.health ?? 0;
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

  public dropsFor(brokenWith: PlayerPowerup) {
    return terrainBlockDropsForKind(this.kind, brokenWith);
  }
}

const terrainBlockByKind: Record<TerrainTileKind, TerrainBlock> = {
  bedrock: new TerrainBlock({
    kind: "bedrock",
    health: null,
    sprite: Resources.Bedrock,
  }),
  dirt: new TerrainBlock({
    kind: "dirt",
    health: 4,
    sprite: Resources.Dirt,
  }),
  grass: new TerrainBlock({
    kind: "grass",
    health: 4,
    sprite: Resources.Grass,
  }),
  lamp: new TerrainBlock({
    kind: "lamp",
    health: 5,
    sprite: Resources.Lamp,
  }),
  mushroom: new TerrainBlock({
    kind: "mushroom",
    health: 4,
    sprite: Resources.MinerPowerup,
  }),
  pillarBottom: new TerrainBlock({
    kind: "pillarBottom",
    health: null,
    sprite: Resources.PillarBottom,
  }),
  pillarMiddle: new TerrainBlock({
    kind: "pillarMiddle",
    health: null,
    sprite: Resources.PillarMiddle,
  }),
  pillarTop: new TerrainBlock({
    kind: "pillarTop",
    health: null,
    sprite: Resources.PillarTop,
  }),
  spawn: new TerrainBlock({
    kind: "spawn",
    health: null,
    sprite: Resources.Spawn,
  }),
  spawnOrb: new TerrainBlock({
    kind: "spawnOrb",
    health: null,
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
    health: 10,
    sprite: Resources.Stone,
  }),
  whiteWool: new TerrainBlock({
    kind: "whiteWool",
    health: 4,
    sprite: Resources.WhiteWool,
  }),
};

export const terrainBlockForKind = (kind: TerrainTileKind) =>
  terrainBlockByKind[kind];
