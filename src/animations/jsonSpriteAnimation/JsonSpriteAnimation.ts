import * as ex from "excalibur";
import {
  anchorVecForPoseFacing,
  anchorVecForPreset,
  DEFAULT_ANCHOR_PRESET,
  excaliburAnchorForVec,
  spriteForImageWithAnchor,
} from "./anchor.ts";
import type { JsonSpriteAnimationSpec, JsonSpritePose } from "./types";

type JsonSpriteAnimationOptions = {
  host: ex.Actor;
  spec: JsonSpriteAnimationSpec;
  spritesByKey: Record<string, ex.ImageSource>;
  hostSpriteId?: string;
  z?: number;
  loop?: boolean;
};

type PoseById = Record<string, JsonSpritePose>;

const degToRad = (deg: number) => (deg * Math.PI) / 180;

const applyAnchorToSprite = (
  sprite: ex.Sprite,
  pose: JsonSpritePose,
  facingLeft: boolean,
) => {
  const vec = anchorVecForPoseFacing(pose, facingLeft);
  sprite.origin = ex.vec(sprite.width * vec.x, sprite.height * vec.y);
  return sprite;
};

const spriteForImage = (
  image: ex.ImageSource,
  pose: JsonSpritePose,
  facingLeft: boolean,
) => spriteForImageWithAnchor(image, anchorVecForPoseFacing(pose, facingLeft));

const hiddenActorPosition = ex.vec(-100000, -100000);

export class JsonSpriteAnimation {
  private readonly host: ex.Actor;
  private readonly spec: JsonSpriteAnimationSpec;
  private readonly spritesByKey: Record<string, ex.ImageSource>;
  private readonly hostSpriteId?: string;
  private readonly z: number;
  private readonly loop: boolean;
  private readonly overlayActor: ex.Actor;

  private readonly posesByFrameIndex: readonly PoseById[];
  private readonly spriteKeyById: Record<string, string>;
  private readonly childActorsById: Record<string, ex.Actor>;
  private readonly spriteOverrideByPartId: Record<string, ex.ImageSource> = {};
  private readonly spriteByPixelDataUrl: Record<string, ex.Sprite | undefined> = {};
  private readonly imageSourceByPixelDataUrl: Record<string, ex.ImageSource> = {};
  private readonly loadingByPixelDataUrl: Record<string, Promise<void> | undefined> = {};
  private static readonly overlaySizePx = 128;

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
    this.loop = options.loop ?? true;

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
        const sprite = spriteForImageWithAnchor(
          imageSource,
          anchorVecForPreset(DEFAULT_ANCHOR_PRESET),
        );
        const actor = new ex.Actor({
          pos: ex.vec(0, 0),
          anchor: ex.vec(0.5, 0.5),
          width: sprite.width,
          height: sprite.height,
          z: 0,
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

    const overlayActor = new ex.Actor({
      pos: ex.vec(0, 0),
      anchor: ex.vec(0.5, 0.5),
      width: JsonSpriteAnimation.overlaySizePx,
      height: JsonSpriteAnimation.overlaySizePx,
      z: 0,
    });
    overlayActor.graphics.visible = false;
    overlayActor.graphics.opacity = 0;
    this.host.addChild(overlayActor);
    this.overlayActor = overlayActor;
    this.hideAll();
  }

  public actorForPart(partId: string): ex.Actor | undefined {
    if (this.hostSpriteId !== undefined && partId === this.hostSpriteId) {
      return this.host;
    }
    return this.childActorsById[partId];
  }

  private spriteForPixelDataUrl(dataUrl: string): ex.Sprite | undefined {
    const cached = this.spriteByPixelDataUrl[dataUrl];
    if (cached !== undefined) {
      return cached;
    }

    const existing = this.imageSourceByPixelDataUrl[dataUrl];
    const imageSource =
      existing !== undefined ? existing : new ex.ImageSource(dataUrl);

    if (existing === undefined) {
      this.imageSourceByPixelDataUrl[dataUrl] = imageSource;
    }

    if (!imageSource.isLoaded()) {
      if (this.loadingByPixelDataUrl[dataUrl] === undefined) {
        this.loadingByPixelDataUrl[dataUrl] = imageSource.load().then(() => {
          const sprite = spriteForImageWithAnchor(
            imageSource,
            anchorVecForPreset(DEFAULT_ANCHOR_PRESET),
          );
          this.spriteByPixelDataUrl[dataUrl] = sprite;
        });
      }
      return undefined;
    }

    const sprite = spriteForImageWithAnchor(
      imageSource,
      anchorVecForPreset(DEFAULT_ANCHOR_PRESET),
    );
    this.spriteByPixelDataUrl[dataUrl] = sprite;
    return sprite;
  }

  private spriteForPoseSource(
    imageSource: ex.ImageSource,
    pose: JsonSpritePose,
    facingLeft: boolean,
  ): ex.Sprite {
    return spriteForImage(imageSource, pose, facingLeft);
  }

  private spriteForPose(
    pose: JsonSpritePose,
    imageSource: ex.ImageSource,
    facingLeft: boolean,
  ): ex.Sprite | undefined {
    if (pose.pixelDataUrl !== undefined) {
      const cached = this.spriteForPixelDataUrl(pose.pixelDataUrl);
      if (cached === undefined) {
        return undefined;
      }
      return applyAnchorToSprite(cached, pose, facingLeft);
    }
    const override = this.spriteOverrideByPartId[pose.id];
    const resolvedSource = override ?? imageSource;
    return this.spriteForPoseSource(resolvedSource, pose, facingLeft);
  }

  public setPartSprite(partId: string, imageSource: ex.ImageSource): void {
    this.spriteOverrideByPartId[partId] = imageSource;
    this.syncFrame();
  }

  public play() {
    this.isPlaying = true;
  }

  public pause() {
    this.isPlaying = false;
  }

  public hideAll() {
    this.host.graphics.visible = false;
    this.host.graphics.opacity = 0;
    this.overlayActor.graphics.visible = false;
    this.overlayActor.graphics.opacity = 0;
    Object.keys(this.childActorsById).forEach((id) => {
      const actor = this.childActorsById[id];
      actor.pos = hiddenActorPosition;
      actor.graphics.visible = false;
      actor.graphics.opacity = 0;
    });
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
      const nextElapsedMs = this.elapsedMs + deltaMs;
      const durationMs = this.durationMs();
      if (!this.loop && nextElapsedMs >= durationMs) {
        this.elapsedMs = durationMs;
        this.currentFrameIndex = Math.max(this.spec.frames.length - 1, 0);
        this.isPlaying = false;
      }
      if (this.isPlaying) {
        this.elapsedMs = nextElapsedMs;
        this.currentFrameIndex = this.frameIndexForElapsedMs(this.elapsedMs);
      }
    }

    this.syncFrame();
  }

  public isFinished() {
    return !this.isPlaying && this.elapsedMs >= this.durationMs();
  }

  public elapsedRatio() {
    const durationMs = this.durationMs();
    if (durationMs <= 0) {
      return 0;
    }
    return Math.min(this.elapsedMs / durationMs, 1);
  }

  public durationMs(): number {
    return this.spec.frames.length * this.effectiveFrameDurationMs();
  }

  public hostPoseOffset(): ex.Vector {
    if (this.hostSpriteId === undefined) {
      return ex.vec(0, 0);
    }
    const framePoses = this.posesByFrameIndex[this.currentFrameIndex];
    const pose = framePoses?.[this.hostSpriteId];
    if (pose === undefined) {
      return ex.vec(0, 0);
    }
    const px = this.lastFacingLeft ? -pose.offset.x : pose.offset.x;
    return ex.vec(px, pose.offset.y);
  }

  private speedMultiplier(): number {
    const speed = this.spec.speed ?? 1;
    return speed > 0 ? speed : 1;
  }

  private effectiveFrameDurationMs(): number {
    const frameDurationMs = this.spec.frameDurationMs;
    const speed = this.speedMultiplier();
    return frameDurationMs / speed;
  }

  private frameIndexForElapsedMs(elapsedMs: number) {
    const durationMs = this.durationMs();
    if (durationMs <= 0) {
      return 0;
    }
    const loopElapsedMs = this.loop
      ? elapsedMs % durationMs
      : Math.min(elapsedMs, durationMs - 0.0001);
    const effectiveElapsedMs =
      loopElapsedMs === 0 && elapsedMs > 0
        ? durationMs - 0.0001
        : loopElapsedMs;
    const index = Math.floor(
      effectiveElapsedMs / Math.max(this.effectiveFrameDurationMs(), 0.0001),
    );
    return Math.min(index, Math.max(this.spec.frames.length - 1, 0));
  }

  private placementForStoredPose(
    pose: JsonSpritePose,
    facingLeft: boolean,
    base: ex.Vector,
  ): ex.Vector {
    const px = facingLeft ? -pose.offset.x : pose.offset.x;
    const py = pose.offset.y;
    return ex.vec(base.x + px, base.y + py);
  }

  private syncFrame() {
    const framePoses: PoseById | undefined =
      this.posesByFrameIndex[this.currentFrameIndex];
    const frame = this.spec.frames[this.currentFrameIndex];
    const overlayPixelDataUrl = frame.overlayPixelDataUrl;
    const overlayVisible = frame.overlayVisible !== false;

    if (this.hostSpriteId !== undefined) {
      const hostPose = framePoses?.[this.hostSpriteId];
      if (hostPose === undefined) {
        this.host.graphics.visible = false;
        this.host.graphics.opacity = 0;
        this.overlayActor.graphics.visible = false;
        this.overlayActor.graphics.opacity = 0;
      }
      if (hostPose !== undefined) {
        this.host.z = this.z + (hostPose.layer ?? 0);
        const hostImageSource = this.spritesByKey[hostPose.spriteKey];
        const hostSprite = this.spriteForPose(
          hostPose,
          hostImageSource,
          this.lastFacingLeft,
        );
        const hostPlacement = this.placementForStoredPose(
          hostPose,
          this.lastFacingLeft,
          this.lastBaseOffset,
        );
        const hostAnchor = excaliburAnchorForVec(
          anchorVecForPoseFacing(hostPose, this.lastFacingLeft),
        );
        if (hostSprite === undefined) {
          this.host.graphics.visible = false;
          this.host.graphics.opacity = 0;
        } else {
          this.host.graphics.anchor = hostAnchor;
          this.host.graphics.use(hostSprite);
          this.host.graphics.flipHorizontal = this.lastFacingLeft;
          this.host.graphics.offset = hostPlacement;
          this.host.graphics.visible = hostPose.visible !== false;
          this.host.graphics.opacity = hostPose.visible === false ? 0 : 1;
        }

        if (overlayPixelDataUrl !== undefined) {
          const overlaySprite =
            this.spriteForPixelDataUrl(overlayPixelDataUrl);
          if (overlaySprite === undefined) {
            this.overlayActor.graphics.visible = false;
            this.overlayActor.graphics.opacity = 0;
          } else {
            this.overlayActor.graphics.use(overlaySprite);
            this.overlayActor.graphics.flipHorizontal = this.lastFacingLeft;

            this.overlayActor.pos = hostPlacement;
            this.overlayActor.z = this.z + 10000 + (hostPose.layer ?? 0);

            this.overlayActor.graphics.visible = overlayVisible;
            this.overlayActor.graphics.opacity = overlayVisible ? 1 : 0;
          }
        } else {
          this.overlayActor.graphics.visible = false;
          this.overlayActor.graphics.opacity = 0;
        }
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

      actor.z = pose.layer ?? 0;
      actor.rotation = this.lastFacingLeft
        ? -degToRad(pose.rotationDeg)
        : degToRad(pose.rotationDeg);
      actor.graphics.flipHorizontal = this.lastFacingLeft;
      const partImageSource = this.spritesByKey[pose.spriteKey];
      const partSprite = this.spriteForPose(
        pose,
        partImageSource,
        this.lastFacingLeft,
      );
      if (partSprite === undefined) {
        actor.graphics.visible = false;
        actor.graphics.opacity = 0;
        return;
      }

      const partPlacement = this.placementForStoredPose(
        pose,
        this.lastFacingLeft,
        this.lastBaseOffset,
      );
      actor.graphics.anchor = excaliburAnchorForVec(
        anchorVecForPoseFacing(pose, this.lastFacingLeft),
      );
      actor.pos = partPlacement;
      actor.graphics.use(partSprite);
      actor.graphics.visible = pose.visible !== false;
      actor.graphics.opacity = pose.visible === false ? 0 : 1;
    });
  }
}
