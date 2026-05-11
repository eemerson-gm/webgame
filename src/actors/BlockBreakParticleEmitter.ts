import * as ex from "excalibur";
import type { TerrainBlock } from "../classes/TerrainBlock";
import type { TerrainTileMap } from "../classes/TerrainTileMap";
import { BlockBreakParticleActor } from "./BlockBreakParticleActor";

export type TargetBlockPosition = {
  column: number;
  row: number;
};

export type BlockBreakParticleState = {
  target: TargetBlockPosition;
  elapsedMs: number;
  durationMs: number | null;
  nextParticleAtMs: number;
};

type SpriteAlphaMask = {
  width: number;
  height: number;
  alpha: Uint8ClampedArray;
};

type ParticleSample = {
  fragmentSize: number;
  sourceCenterX: number;
  sourceCenterY: number;
};

const blockBreakParticleIntervalMs = 70;
const blockBreakParticlesPerBurst = 2;
const blockBreakParticleSpawnChance = 0.72;
const blockBreakParticleSizes = [1, 2];
const blockBreakParticleDurationMs = 420;
const alphaMaskBySpriteKey: Record<string, SpriteAlphaMask | null> = {};
const opaqueParticlePositionsBySpriteKey: Record<string, ex.Vector[]> = {};

const indexes = (count: number) => Array.from({ length: count }, (_, index) => index);

const randomBetween = (minimum: number, maximum: number) =>
  minimum + Math.random() * (maximum - minimum);

const randomIntegerBetween = (minimum: number, maximum: number) =>
  Math.floor(randomBetween(minimum, maximum + 1));

const spriteKeyFor = (sprite: ex.Sprite, fragmentSize: number = 0) =>
  [
    sprite.image.path,
    sprite.sourceView.x,
    sprite.sourceView.y,
    sprite.sourceView.width,
    sprite.sourceView.height,
    fragmentSize,
  ].join(":");

const alphaMaskFor = (sprite: ex.Sprite) => {
  const key = spriteKeyFor(sprite);
  if (Object.prototype.hasOwnProperty.call(alphaMaskBySpriteKey, key)) {
    return alphaMaskBySpriteKey[key];
  }
  const canvas = document.createElement("canvas");
  canvas.width = sprite.sourceView.width;
  canvas.height = sprite.sourceView.height;
  const context = canvas.getContext("2d");
  if (!context) {
    alphaMaskBySpriteKey[key] = null;
    return null;
  }
  context.imageSmoothingEnabled = false;
  context.drawImage(
    sprite.image.image,
    sprite.sourceView.x,
    sprite.sourceView.y,
    sprite.sourceView.width,
    sprite.sourceView.height,
    0,
    0,
    sprite.sourceView.width,
    sprite.sourceView.height,
  );
  const mask = {
    width: sprite.sourceView.width,
    height: sprite.sourceView.height,
    alpha: context.getImageData(
      0,
      0,
      sprite.sourceView.width,
      sprite.sourceView.height,
    ).data,
  };
  alphaMaskBySpriteKey[key] = mask;
  return mask;
};

const isOpaquePixel = (mask: SpriteAlphaMask, x: number, y: number) =>
  mask.alpha[(y * mask.width + x) * 4 + 3] > 0;

const isOpaqueFragment = (
  mask: SpriteAlphaMask,
  x: number,
  y: number,
  size: number,
) =>
  indexes(size).every((offsetX) =>
    indexes(size).every((offsetY) =>
      isOpaquePixel(mask, x + offsetX, y + offsetY),
    ),
  );

const opaqueParticlePositionsFor = (block: TerrainBlock, fragmentSize: number) => {
  const sprite = block.toSprite();
  const key = spriteKeyFor(sprite, fragmentSize);
  const cachedPositions = opaqueParticlePositionsBySpriteKey[key];
  if (cachedPositions) {
    return cachedPositions;
  }
  const mask = alphaMaskFor(sprite);
  if (!mask) {
    opaqueParticlePositionsBySpriteKey[key] = [];
    return [];
  }
  const positions = indexes(mask.width - fragmentSize + 1).flatMap((x) =>
    indexes(mask.height - fragmentSize + 1)
      .filter((y) => isOpaqueFragment(mask, x, y, fragmentSize))
      .map((y) => ex.vec(x, y)),
  );
  opaqueParticlePositionsBySpriteKey[key] = positions;
  return positions;
};

export class BlockBreakParticleEmitter {
  private readonly terrain: TerrainTileMap;
  private engine?: ex.Engine;

  constructor(terrain: TerrainTileMap) {
    this.terrain = terrain;
  }

  public initialize(engine: ex.Engine) {
    this.engine = engine;
  }

  public createState(
    target: TargetBlockPosition,
    durationMs: number | null = null,
  ): BlockBreakParticleState {
    return {
      target: {
        column: target.column,
        row: target.row,
      },
      elapsedMs: 0,
      durationMs,
      nextParticleAtMs: 0,
    };
  }

  public updateState(state: BlockBreakParticleState | null, delta: number) {
    if (!state) {
      return;
    }
    state.elapsedMs += delta;
    while (
      state.nextParticleAtMs <= state.elapsedMs &&
      (state.durationMs === null || state.nextParticleAtMs < state.durationMs)
    ) {
      this.emitBurst(state.target);
      state.nextParticleAtMs += blockBreakParticleIntervalMs;
    }
  }

  private emitBurst(target: TargetBlockPosition) {
    const block = this.terrain.blockAt(target.column, target.row);
    const engine = this.engine;
    if (!block || !engine) {
      return;
    }
    const spriteSize = block.spriteSize();
    const availableParticleSizes = this.availableParticleSizes(spriteSize);
    if (!availableParticleSizes.length) {
      return;
    }
    indexes(blockBreakParticlesPerBurst).forEach(() => {
      const sample = this.particleSampleFor(block, availableParticleSizes);
      if (!sample) {
        return;
      }
      this.emitParticleAt(target, block, engine, spriteSize, sample);
    });
  }

  private availableParticleSizes(spriteSize: { width: number; height: number }) {
    return blockBreakParticleSizes.filter(
      (size) => size <= spriteSize.width && size <= spriteSize.height,
    );
  }

  private emitParticleAt(
    target: TargetBlockPosition,
    block: TerrainBlock,
    engine: ex.Engine,
    spriteSize: { width: number; height: number },
    sample: ParticleSample,
    spawnChance = blockBreakParticleSpawnChance,
  ) {
    if (Math.random() > spawnChance) {
      return;
    }
    const { fragmentSize, sourceCenterX, sourceCenterY } = sample;
    const sourceX = Math.max(
      0,
      Math.min(
        spriteSize.width - fragmentSize,
        Math.floor(sourceCenterX - fragmentSize / 2),
      ),
    );
    const sourceY = Math.max(
      0,
      Math.min(
        spriteSize.height - fragmentSize,
        Math.floor(sourceCenterY - fragmentSize / 2),
      ),
    );
    const position = this.particlePositionFor(
      target,
      sourceCenterX,
      sourceCenterY,
      spriteSize.width,
      spriteSize.height,
    );
    engine.add(
      new BlockBreakParticleActor({
        pos: position,
        graphic: block.toSpriteFragment(
          sourceX,
          sourceY,
          fragmentSize,
          fragmentSize,
        ),
        velocity: this.particleVelocityFor(target, position),
        durationMs: randomBetween(
          blockBreakParticleDurationMs * 0.75,
          blockBreakParticleDurationMs * 1.25,
        ),
      }),
    );
  }

  private particleSampleFor(
    block: TerrainBlock,
    availableParticleSizes: number[],
  ): ParticleSample | null {
    const fragmentSize =
      availableParticleSizes[
        randomIntegerBetween(0, availableParticleSizes.length - 1)
      ];
    const positions = opaqueParticlePositionsFor(block, fragmentSize);
    if (!positions.length) {
      return null;
    }
    const position = positions[randomIntegerBetween(0, positions.length - 1)];
    return {
      fragmentSize,
      sourceCenterX: position.x + fragmentSize / 2,
      sourceCenterY: position.y + fragmentSize / 2,
    };
  }

  private particlePositionFor(
    target: TargetBlockPosition,
    sourceCenterX: number,
    sourceCenterY: number,
    sourceWidth: number,
    sourceHeight: number,
  ) {
    const topLeft = this.tileTopLeft(target);
    return ex.vec(
      topLeft.x + (sourceCenterX / sourceWidth) * this.terrain.map.tileWidth,
      topLeft.y + (sourceCenterY / sourceHeight) * this.terrain.map.tileHeight,
    );
  }

  private particleVelocityFor(target: TargetBlockPosition, position: ex.Vector) {
    const center = this.tileCenter(target);
    return ex.vec(
      (position.x - center.x) * randomBetween(1.4, 2.2) + randomBetween(-3, 3),
      (position.y - center.y) * randomBetween(1, 1.8) - randomBetween(8, 18),
    );
  }

  private tileTopLeft(target: TargetBlockPosition) {
    return ex.vec(
      this.terrain.map.pos.x + target.column * this.terrain.map.tileWidth,
      this.terrain.map.pos.y + target.row * this.terrain.map.tileHeight,
    );
  }

  private tileCenter(target: TargetBlockPosition) {
    const topLeft = this.tileTopLeft(target);
    return ex.vec(
      topLeft.x + this.terrain.map.tileWidth / 2,
      topLeft.y + this.terrain.map.tileHeight / 2,
    );
  }
}
