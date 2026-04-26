import * as ex from "excalibur";
import { TILE_PX } from "../world/worldConfig";
import { DamageFlashRaster } from "./DamageFlashRaster";

export type DamageableActor<TActor extends ex.Actor = ex.Actor> = ex.Actor & {
  takeDamageFrom: (actor: TActor, damage?: number) => boolean;
  isAlive: () => boolean;
};

type DamageFlashOptions = {
  durationMs: number;
  blinkFrameMs: number;
  z: number;
};

const damageFlashOpacity = 0.75;

export class DamageFlash extends ex.Actor {
  private readonly durationMs: number;
  private readonly blinkFrameMs: number;
  private timeRemainingMs = 0;
  private elapsedMs = 0;

  constructor(options: DamageFlashOptions) {
    super({
      pos: ex.vec(0, 0),
      anchor: ex.vec(0, 0),
      width: TILE_PX,
      height: TILE_PX,
      z: options.z,
    });
    this.durationMs = options.durationMs;
    this.blinkFrameMs = options.blinkFrameMs;
    this.graphics.anchor = ex.vec(0, 0);
    this.graphics.use(new DamageFlashRaster());
    this.hide();
  }

  public start() {
    this.timeRemainingMs = this.durationMs;
    this.elapsedMs = 0;
    this.show();
  }

  public tick(delta: number) {
    if (this.timeRemainingMs <= 0) {
      this.hide();
      return;
    }
    this.timeRemainingMs = Math.max(this.timeRemainingMs - delta, 0);
    this.elapsedMs += delta;
    if (this.isBlinkFrameVisible()) {
      this.show();
      return;
    }
    this.hide();
  }

  private isBlinkFrameVisible() {
    return Math.floor(this.elapsedMs / this.blinkFrameMs) % 2 === 0;
  }

  private show() {
    this.graphics.visible = true;
    this.graphics.opacity = damageFlashOpacity;
  }

  private hide() {
    this.graphics.visible = false;
    this.graphics.opacity = 0;
  }
}
