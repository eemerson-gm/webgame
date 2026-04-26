import * as ex from "excalibur";

export type DamageableActor<TActor extends ex.Actor = ex.Actor> = ex.Actor & {
  takeDamageFrom: (actor: TActor, damage?: number) => boolean;
  isAlive: () => boolean;
};

type DamageFlashOptions = {
  durationMs: number;
  blinkFrameMs: number;
};

const fullWhiteMaterialSource = `#version 300 es
precision mediump float;

uniform sampler2D u_graphic;

in vec2 v_uv;
out vec4 fragColor;

void main() {
  vec4 sourceColor = texture(u_graphic, v_uv);
  fragColor = vec4(sourceColor.a, sourceColor.a, sourceColor.a, sourceColor.a);
}`;

export class DamageFlash {
  private readonly actor: ex.Actor;
  private readonly durationMs: number;
  private readonly blinkFrameMs: number;
  private material?: ex.Material;
  private originalMaterial?: ex.Material | null;
  private timeRemainingMs = 0;
  private elapsedMs = 0;
  private isVisible = false;

  constructor(actor: ex.Actor, options: DamageFlashOptions) {
    this.actor = actor;
    this.durationMs = options.durationMs;
    this.blinkFrameMs = options.blinkFrameMs;
  }

  public initialize(engine: ex.Engine) {
    this.material = engine.graphicsContext.createMaterial({
      name: "damage-flash",
      fragmentSource: fullWhiteMaterialSource,
    });
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
    if (this.timeRemainingMs <= 0) {
      this.hide();
      return;
    }
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
    if (this.isVisible) {
      return;
    }
    this.originalMaterial = this.actor.graphics.material;
    this.actor.graphics.material = this.material ?? this.originalMaterial ?? null;
    this.isVisible = true;
  }

  private hide() {
    if (!this.isVisible) {
      return;
    }
    if (this.actor.graphics.material === this.material) {
      this.actor.graphics.material = this.originalMaterial ?? null;
    }
    this.isVisible = false;
  }
}
