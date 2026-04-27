import * as ex from "excalibur";

type ParticleActorOptions = {
  pos: ex.Vector;
  frames: ex.Graphic[];
  frameDurationMs: number;
  width?: number;
  height?: number;
  z?: number;
  anchor?: ex.Vector;
};

export class ParticleActor extends ex.Actor {
  private readonly animation: ex.Animation;
  private readonly durationMs: number;
  private elapsedMs = 0;

  constructor(options: ParticleActorOptions) {
    super({
      pos: options.pos,
      anchor: options.anchor ?? ex.vec(0.5, 0.5),
      width: options.width ?? options.frames[0]?.width ?? 0,
      height: options.height ?? options.frames[0]?.height ?? 0,
      z: options.z ?? 12,
    });
    this.animation = new ex.Animation({
      frames: options.frames.map((graphic) => ({ graphic })),
      frameDuration: options.frameDurationMs,
      strategy: ex.AnimationStrategy.Freeze,
    });
    this.durationMs = options.frames.length * options.frameDurationMs;
  }

  override onInitialize() {
    this.graphics.use(this.animation);
    this.animation.play();
  }

  override onPostUpdate(_engine: ex.Engine, delta: number) {
    void _engine;
    this.elapsedMs += delta;
    if (this.elapsedMs < this.durationMs) {
      return;
    }
    this.kill();
  }
}
