import * as ex from "excalibur";
import { Resources } from "../../resource";
import { TILE_PX } from "../../world/worldConfig";
import { JsonSpriteAnimation } from "../../animations/jsonSpriteAnimation/JsonSpriteAnimation";
import type { JsonSpriteAnimationSpec } from "../../animations/jsonSpriteAnimation/types";
import idleJson from "../../data/animations/player/player_idle.json";
import walkJson from "../../data/animations/player/player_walk.json";
import jumpJson from "../../data/animations/player/player_jump.json";
import crouchJson from "../../data/animations/player/player_crouch.json";
import groundSwordJson from "../../data/animations/player_ground_sword_side.json";

export type PlayerVisual = "idle" | "walk" | "jump" | "crouch" | "ground_sword";

const sleepBubbleAnchor = ex.vec(0.5, 1);
const sleepBubbleOffset = ex.vec(TILE_PX / 2, -2);
const playerGraphicOffset = ex.vec(TILE_PX / 2, TILE_PX / 2);
const remoteVisualCorrectionDurationMs = 100;

export class PlayerVisuals {
  public currentVisual: PlayerVisual = "idle";

  private readonly idleAnimation: JsonSpriteAnimation;
  private readonly jumpAnimation: JsonSpriteAnimation;
  private readonly crouchAnimation: JsonSpriteAnimation;
  private readonly walkAnimation: JsonSpriteAnimation;
  private readonly groundSwordAnimation: JsonSpriteAnimation;
  private activeAnimation: JsonSpriteAnimation;

  private facingLeft = false;

  public readonly sleepBubbleActor: ex.Actor;

  private visualCorrectionOffset: ex.Vector = ex.vec(0, 0);
  private visualCorrectionStartOffset: ex.Vector = ex.vec(0, 0);
  private visualCorrectionElapsedMs: number = remoteVisualCorrectionDurationMs;
  private renderOffset: ex.Vector = ex.vec(0, 0);

  constructor(private readonly actor: ex.Actor) {
    const spritesByKey = Resources as unknown as Record<string, ex.ImageSource>;
    const idleSpec = idleJson as unknown as JsonSpriteAnimationSpec;
    const walkSpec = walkJson as unknown as JsonSpriteAnimationSpec;
    const jumpSpec = jumpJson as unknown as JsonSpriteAnimationSpec;
    const crouchSpec = crouchJson as unknown as JsonSpriteAnimationSpec;
    const groundSwordSpec = groundSwordJson as unknown as JsonSpriteAnimationSpec;

    this.sleepBubbleActor = new ex.Actor({
      pos: sleepBubbleOffset,
      anchor: sleepBubbleAnchor,
      width: TILE_PX,
      height: TILE_PX,
      z: 11,
    });
    this.sleepBubbleActor.graphics.anchor = sleepBubbleAnchor;
    this.sleepBubbleActor.graphics.use(Resources.ThoughtBubbleSleep.toSprite());
    this.sleepBubbleActor.graphics.visible = false;
    this.sleepBubbleActor.graphics.opacity = 0;

    this.actor.graphics.anchor = ex.vec(0.5, 0.5);
    this.actor.graphics.offset = playerGraphicOffset;

    this.idleAnimation = new JsonSpriteAnimation({
      host: this.actor,
      spec: idleSpec,
      spritesByKey,
      hostSpriteId: "body",
    });
    this.jumpAnimation = new JsonSpriteAnimation({
      host: this.actor,
      spec: jumpSpec,
      spritesByKey,
      hostSpriteId: "body",
    });
    this.crouchAnimation = new JsonSpriteAnimation({
      host: this.actor,
      spec: crouchSpec,
      spritesByKey,
      hostSpriteId: "body",
    });
    this.walkAnimation = new JsonSpriteAnimation({
      host: this.actor,
      spec: walkSpec,
      spritesByKey,
      hostSpriteId: "body",
    });
    this.groundSwordAnimation = new JsonSpriteAnimation({
      host: this.actor,
      spec: groundSwordSpec,
      spritesByKey,
      hostSpriteId: "body",
    });
    this.activeAnimation = this.idleAnimation;
  }

  public initialize() {
    this.actor.addChild(this.sleepBubbleActor);
    this.setVisual("idle", true);
  }

  public setPaused(isPaused: boolean) {
    this.sleepBubbleActor.graphics.visible = isPaused;
    this.sleepBubbleActor.graphics.opacity = isPaused ? 1 : 0;
    this.activeAnimation.update(
      0,
      this.facingLeft,
      this.visualCorrectionOffset.add(this.renderOffset),
    );
  }

  public bodyGraphicsDrawOffset() {
    return playerGraphicOffset
      .add(this.visualCorrectionOffset)
      .add(this.renderOffset);
  }

  public setVisual(visual: PlayerVisual, force: boolean = false) {
    if (this.currentVisual === visual && !force) {
      return;
    }
    this.activeAnimation.hideAll();

    this.currentVisual = visual;
    const nextAnimation = this.animationFor(visual);
    this.activeAnimation = nextAnimation;
    this.activeAnimation.reset();
    this.activeAnimation.play();
    this.activeAnimation.update(
      0,
      this.facingLeft,
      this.visualCorrectionOffset.add(this.renderOffset),
    );
  }

  public updateFacing(facingLeft: boolean) {
    this.facingLeft = facingLeft;
    this.activeAnimation.update(
      0,
      facingLeft,
      this.visualCorrectionOffset.add(this.renderOffset),
    );
  }

  private animationFor(visual: PlayerVisual) {
    if (visual === "walk") {
      return this.walkAnimation;
    }
    if (visual === "jump") {
      return this.jumpAnimation;
    }
    if (visual === "crouch") {
      return this.crouchAnimation;
    }
    if (visual === "ground_sword") {
      return this.groundSwordAnimation;
    }
    return this.idleAnimation;
  }

  public durationMsForVisual(visual: PlayerVisual): number {
    const animation = this.animationFor(visual);
    return animation.durationMs();
  }

  public applyRemotePositionCorrection(position: ex.Vector, snapDistance: number) {
    const visualWorldPosition = this.visualWorldPosition();
    this.actor.pos = ex.vec(position.x, position.y);
    const nextOffset = visualWorldPosition.sub(this.actor.pos);
    void snapDistance;
    this.visualCorrectionStartOffset = nextOffset;
    this.visualCorrectionElapsedMs = 0;
    this.applyVisualCorrectionOffset(nextOffset);
  }

  private visualWorldPosition() {
    return this.actor.pos.add(this.visualCorrectionOffset).add(this.renderOffset);
  }

  public applyRenderOffset(offset: ex.Vector) {
    this.renderOffset = offset;
    this.syncOffsets();
  }

  private syncOffsets() {
    const offset = this.visualCorrectionOffset.add(this.renderOffset);
    this.sleepBubbleActor.graphics.offset = offset;
    this.activeAnimation.update(0, this.facingLeft, offset);
  }

  private applyVisualCorrectionOffset(offset: ex.Vector) {
    this.visualCorrectionOffset = offset;
    this.syncOffsets();
  }

  public updateVisualCorrection(delta: number) {
    if (this.visualCorrectionElapsedMs < remoteVisualCorrectionDurationMs) {
      const elapsedMs = Math.min(
        this.visualCorrectionElapsedMs + delta,
        remoteVisualCorrectionDurationMs,
      );
      const remainingRatio = 1 - elapsedMs / remoteVisualCorrectionDurationMs;
      this.visualCorrectionElapsedMs = elapsedMs;
      this.applyVisualCorrectionOffset(
        this.visualCorrectionStartOffset.scale(remainingRatio),
      );
    }
    this.activeAnimation.update(
      delta,
      this.facingLeft,
      this.visualCorrectionOffset.add(this.renderOffset),
    );
  }

  public isCurrentAnimationFinished() {
    return this.activeAnimation.isFinished();
  }
}
