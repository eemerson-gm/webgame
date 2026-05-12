import * as ex from "excalibur";
import type {
  JsonSpriteAnimationSpec,
  JsonSpritePose,
  JsonSpriteAnimationStrategy,
} from "./types";

type JsonSpriteAnimationOptions = {
  host: ex.Actor;
  spec: JsonSpriteAnimationSpec;
  spritesByKey: Record<string, ex.ImageSource>;
  hostSpriteId?: string;
  z?: number;
};

type PoseById = Record<string, JsonSpritePose>;

const centeredSpriteFor = (image: ex.ImageSource) => {
  const sprite = image.toSprite();
  sprite.origin = ex.vec(sprite.width / 2, sprite.height / 2);
  return sprite;
};

const degToRad = (deg: number) => (deg * Math.PI) / 180;

export class JsonSpriteAnimation {
  private readonly host: ex.Actor;
  private readonly spec: JsonSpriteAnimationSpec;
  private readonly spritesByKey: Record<string, ex.ImageSource>;
  private readonly hostSpriteId?: string;
  private readonly z: number;

  private readonly posesByFrameIndex: readonly PoseById[];
  private readonly spriteKeyById: Record<string, string>;
  private readonly childActorsById: Record<string, ex.Actor>;

  private elapsedMs = 0;
  private isPlaying = false;
  private currentFrameIndex = 0;

  private lastFacingLeft = false;
  private lastBaseOffset: ex.Vector = ex.vec(0, 0);

  public constructor(options: JsonSpriteAnimationOptions) {
    this.host = options.host;
    this.spec = options.spec;
    this.spritesByKey = options.spritesByKey;
    this.hostSpriteId = options.hostSpriteId;
    this.z = options.z ?? this.host.z ?? 0;

    const posesByFrameIndex = this.spec.frames.map((frame) =>
      frame.sprites.reduce<PoseById>((acc, pose) => {
        acc[pose.id] = pose;
        return acc;
      }, {}),
    );
    this.posesByFrameIndex = posesByFrameIndex;

    const spriteKeyById = this.spec.frames.reduce<Record<string, string>>(
      (acc, frame) =>
        frame.sprites.reduce<Record<string, string>>((acc2, pose) => {
          if (acc2[pose.id] === undefined) {
            acc2[pose.id] = pose.spriteKey;
          }
          return acc2;
        }, acc),
      {},
    );
    this.spriteKeyById = spriteKeyById;

    const childActorIds = Object.keys(this.spriteKeyById).filter(
      (id) => id !== this.hostSpriteId,
    );

    const childActorsById = childActorIds.reduce<Record<string, ex.Actor>>(
      (acc, id) => {
        const spriteKey = this.spriteKeyById[id];
        const imageSource = this.spritesByKey[spriteKey];
        const sprite = centeredSpriteFor(imageSource);
        const actor = new ex.Actor({
          pos: ex.vec(0, 0),
          anchor: ex.vec(0.5, 0.5),
          width: sprite.width,
          height: sprite.height,
          z: this.z,
        });
        actor.graphics.use(sprite);
        actor.graphics.visible = false;
        actor.graphics.opacity = 0;
        this.host.addChild(actor);
        acc[id] = actor;
        return acc;
      },
      {},
    );

    this.childActorsById = childActorsById;
    this.syncFrame();
  }

  public play() {
    this.isPlaying = true;
  }

  public pause() {
    this.isPlaying = false;
  }

  public reset() {
    this.elapsedMs = 0;
    this.currentFrameIndex = 0;
    this.syncFrame();
  }

  public update(deltaMs: number, facingLeft: boolean, baseOffset: ex.Vector) {
    this.lastFacingLeft = facingLeft;
    this.lastBaseOffset = baseOffset;

    if (this.isPlaying) {
      const durationMs = this.durationMs();
      const nextElapsedMs = this.elapsedMs + deltaMs;
      const shouldFreeze =
        this.spec.strategy === "freeze" && nextElapsedMs >= durationMs;
      if (shouldFreeze) {
        this.elapsedMs = durationMs;
        this.currentFrameIndex = Math.max(this.spec.frames.length - 1, 0);
        this.isPlaying = false;
      }
      if (!shouldFreeze) {
        this.elapsedMs = nextElapsedMs;
        this.currentFrameIndex = this.frameIndexForElapsedMs(this.elapsedMs);
      }
    }

    this.syncFrame();
  }

  private durationMs(): number {
    return this.spec.frames.length * this.spec.frameDurationMs;
  }

  private frameIndexForElapsedMs(elapsedMs: number) {
    const durationMs = this.durationMs();
    if (durationMs <= 0) {
      return 0;
    }
    const strategy: JsonSpriteAnimationStrategy = this.spec.strategy;
    const effectiveElapsedMs =
      strategy === "loop"
        ? elapsedMs % durationMs
        : Math.min(elapsedMs, Math.max(durationMs - 0.0001, 0));
    const index = Math.floor(
      effectiveElapsedMs / Math.max(this.spec.frameDurationMs, 0.0001),
    );
    return Math.min(index, Math.max(this.spec.frames.length - 1, 0));
  }

  private syncFrame() {
    const framePoses: PoseById | undefined =
      this.posesByFrameIndex[this.currentFrameIndex];
    const mirrorWidth = this.spec.mirrorWidth;

    if (this.hostSpriteId !== undefined) {
      const hostPose = framePoses?.[this.hostSpriteId];
      if (hostPose === undefined) {
        this.host.graphics.visible = false;
        this.host.graphics.opacity = 0;
      }
      if (hostPose !== undefined) {
        const mirroredX = this.lastFacingLeft
          ? mirrorWidth - hostPose.offset.x
          : hostPose.offset.x;
        const sprite = centeredSpriteFor(
          this.spritesByKey[hostPose.spriteKey],
        );
        this.host.graphics.use(sprite);
        this.host.graphics.flipHorizontal = this.lastFacingLeft;
        this.host.graphics.offset = ex.vec(
          this.lastBaseOffset.x + mirroredX,
          this.lastBaseOffset.y + hostPose.offset.y,
        );
        this.host.graphics.visible = hostPose.visible !== false;
        this.host.graphics.opacity = hostPose.visible === false ? 0 : 1;
      }
    }

    Object.keys(this.childActorsById).forEach((id) => {
      const actor = this.childActorsById[id];
      const pose = framePoses?.[id];
      if (!pose) {
        actor.pos = ex.vec(-100000, -100000);
        actor.graphics.visible = false;
        actor.graphics.opacity = 0;
        return;
      }

      const x = this.lastFacingLeft ? mirrorWidth - pose.offset.x : pose.offset.x;
      const y = pose.offset.y;
      actor.pos = ex.vec(
        this.lastBaseOffset.x + x,
        this.lastBaseOffset.y + y,
      );
      actor.rotation = this.lastFacingLeft
        ? -degToRad(pose.rotationDeg)
        : degToRad(pose.rotationDeg);
      actor.graphics.flipHorizontal = this.lastFacingLeft;
      actor.graphics.visible = pose.visible !== false;
      actor.graphics.opacity = pose.visible === false ? 0 : 1;
    });
  }
}

