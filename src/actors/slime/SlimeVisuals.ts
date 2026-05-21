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

export class SlimeVisuals {
  private readonly locomotion: JsonLocomotionVisuals;

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

  public update(delta: number) {
    this.locomotion.update(delta);
  }
}
