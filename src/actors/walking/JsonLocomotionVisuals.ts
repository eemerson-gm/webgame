import * as ex from "excalibur";
import { JsonSpriteAnimation } from "@/animations/jsonSpriteAnimation/JsonSpriteAnimation";
import type { JsonSpriteAnimationSpec } from "@/animations/jsonSpriteAnimation/types";
import type { LocomotionVisual, LocomotionVisualsHost } from "./LocomotionVisuals";

export type JsonLocomotionVisualsOptions = {
  actor: ex.Actor;
  spritesByKey: Record<string, ex.ImageSource>;
  graphicOffset: ex.Vector;
  hostSpriteId: string;
  idleSpec: JsonSpriteAnimationSpec;
  walkSpec: JsonSpriteAnimationSpec;
  jumpSpec: JsonSpriteAnimationSpec;
  drawZ?: number;
};

export class JsonLocomotionVisuals implements LocomotionVisualsHost {
  public currentVisual: LocomotionVisual = "idle";

  private readonly idleAnimation: JsonSpriteAnimation;
  private readonly walkAnimation: JsonSpriteAnimation;
  private readonly jumpAnimation: JsonSpriteAnimation;
  private activeAnimation: JsonSpriteAnimation;
  private facingLeft = false;
  private readonly graphicOffset: ex.Vector;

  constructor(private readonly options: JsonLocomotionVisualsOptions) {
    this.graphicOffset = options.graphicOffset;
    options.actor.graphics.anchor = ex.vec(0.5, 0.5);
    if (options.drawZ !== undefined) {
      options.actor.z = options.drawZ;
    }

    this.idleAnimation = new JsonSpriteAnimation({
      host: options.actor,
      spec: options.idleSpec,
      spritesByKey: options.spritesByKey,
      hostSpriteId: options.hostSpriteId,
    });
    this.walkAnimation = new JsonSpriteAnimation({
      host: options.actor,
      spec: options.walkSpec,
      spritesByKey: options.spritesByKey,
      hostSpriteId: options.hostSpriteId,
    });
    this.jumpAnimation = new JsonSpriteAnimation({
      host: options.actor,
      spec: options.jumpSpec,
      spritesByKey: options.spritesByKey,
      hostSpriteId: options.hostSpriteId,
    });
    this.activeAnimation = this.idleAnimation;
  }

  public initialize() {
    this.applyVisual("idle", true);
  }

  public bodyGraphicCenter() {
    return this.graphicOffset.add(this.activeAnimation.hostPoseOffset());
  }

  public setLocomotionVisual(visual: LocomotionVisual, force: boolean = false) {
    this.applyVisual(visual, force);
  }

  public updateFacing(facingLeft: boolean) {
    this.facingLeft = facingLeft;
    this.activeAnimation.update(0, facingLeft, this.graphicOffset);
  }

  public update(delta: number) {
    this.activeAnimation.update(delta, this.facingLeft, this.graphicOffset);
  }

  public animationFor(visual: LocomotionVisual) {
    if (visual === "walk") {
      return this.walkAnimation;
    }
    if (visual === "jump") {
      return this.jumpAnimation;
    }
    return this.idleAnimation;
  }

  public activeLocomotionAnimation() {
    return this.activeAnimation;
  }

  public hideAllLocomotion() {
    this.idleAnimation.hideAll();
    this.walkAnimation.hideAll();
    this.jumpAnimation.hideAll();
  }

  private applyVisual(visual: LocomotionVisual, force: boolean = false) {
    if (this.currentVisual === visual && !force) {
      return;
    }
    this.activeAnimation.hideAll();
    this.currentVisual = visual;
    this.activeAnimation = this.animationFor(visual);
    this.activeAnimation.reset();
    this.activeAnimation.play();
    this.activeAnimation.update(0, this.facingLeft, this.graphicOffset);
  }
}
