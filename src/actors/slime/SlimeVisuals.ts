import * as ex from "excalibur";
import { spriteResourcesByKey } from "@/resource";
import { TILE_PX } from "@/world/worldConfig";
import type { JsonSpriteAnimationSpec } from "@/animations/jsonSpriteAnimation/types";
import { JsonLocomotionVisuals } from "@/actors/walking/JsonLocomotionVisuals";
import type { LocomotionVisual } from "@/actors/walking/LocomotionVisuals";
import idleJson from "@/data/animations/slime/slime_idle.json";
import walkJson from "@/data/animations/slime/slime_walk.json";
import jumpJson from "@/data/animations/slime/slime_jump.json";

export type SlimeVisual = LocomotionVisual;

export const slimeGraphicOffset = ex.vec(TILE_PX / 2, TILE_PX / 2);
const slimeDrawZ = 3;
const remoteVisualCorrectionDurationMs = 120;

export class SlimeVisuals {
  private readonly locomotion: JsonLocomotionVisuals;
  private visualCorrectionOffset: ex.Vector = ex.vec(0, 0);
  private visualCorrectionStartOffset: ex.Vector = ex.vec(0, 0);
  private visualCorrectionElapsedMs: number = remoteVisualCorrectionDurationMs;
  private renderOffset: ex.Vector = ex.vec(0, 0);

  constructor(private readonly actor: ex.Actor) {
    this.locomotion = new JsonLocomotionVisuals({
      actor: this.actor,
      spritesByKey: spriteResourcesByKey,
      graphicOffset: slimeGraphicOffset,
      hostSpriteId: "body",
      idleSpec: idleJson as unknown as JsonSpriteAnimationSpec,
      walkSpec: walkJson as unknown as JsonSpriteAnimationSpec,
      jumpSpec: jumpJson as unknown as JsonSpriteAnimationSpec,
      drawZ: slimeDrawZ,
    });
  }

  public initialize() {
    this.locomotion.initialize();
  }

  public bodyGraphicCenter() {
    return this.locomotion.bodyGraphicCenter();
  }

  public setLocomotionVisual(visual: SlimeVisual, force: boolean = false) {
    this.locomotion.setLocomotionVisual(visual, force);
  }

  public updateFacing(facingLeft: boolean) {
    this.locomotion.updateFacing(facingLeft);
  }

  public applyRenderOffset(offset: ex.Vector) {
    this.renderOffset = offset;
    this.syncLocomotionOffset();
  }

  public applyRemotePositionCorrection(
    position: ex.Vector,
    snapDistance: number,
  ) {
    const targetPos = ex.vec(position.x, position.y);
    const distance = this.actor.pos.distance(targetPos);
    if (distance < 0.001) {
      return;
    }
    if (distance >= snapDistance) {
      this.actor.pos = targetPos;
      this.resetVisualCorrection();
      return;
    }
    const visualAnchor = this.visualWorldPosition();
    this.actor.pos = targetPos;
    const startOffset = visualAnchor.sub(
      this.actor.pos.add(this.visualDrawOffset()),
    );
    this.visualCorrectionStartOffset = startOffset;
    this.visualCorrectionElapsedMs = 0;
    this.applyVisualCorrectionOffset(startOffset);
  }

  public update(delta: number) {
    this.updateVisualCorrection(delta);
    this.locomotion.update(delta);
  }

  private visualWorldPosition() {
    return this.actor.pos.add(this.visualDrawOffset());
  }

  private visualDrawOffset() {
    return this.bodyGraphicCenter()
      .add(this.visualCorrectionOffset)
      .add(this.renderOffset);
  }

  private resetVisualCorrection() {
    this.visualCorrectionStartOffset = ex.vec(0, 0);
    this.visualCorrectionElapsedMs = remoteVisualCorrectionDurationMs;
    this.applyVisualCorrectionOffset(ex.vec(0, 0));
  }

  private applyVisualCorrectionOffset(offset: ex.Vector) {
    this.visualCorrectionOffset = offset;
    this.syncLocomotionOffset();
  }

  private syncLocomotionOffset() {
    this.locomotion.setRenderExtraOffset(
      this.visualCorrectionOffset.add(this.renderOffset),
    );
  }

  private updateVisualCorrection(delta: number) {
    if (this.visualCorrectionElapsedMs >= remoteVisualCorrectionDurationMs) {
      return;
    }
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
}
