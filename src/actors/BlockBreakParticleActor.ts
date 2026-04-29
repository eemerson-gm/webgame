import * as ex from "excalibur";

type BlockBreakParticleActorOptions = {
  pos: ex.Vector;
  graphic: ex.Graphic;
  velocity: ex.Vector;
  durationMs: number;
};

const blockBreakParticleGravity = 260;
const blockBreakParticleZ = 11;
const blockBreakParticleBorderWidth = 1;
const blockBreakParticleBorderColor = "#000000";

class BlockBreakParticleBorderRaster extends ex.Raster {
  constructor(width: number, height: number) {
    super({
      width,
      height,
      origin: ex.vec(0, 0),
      smoothing: false,
      filtering: ex.ImageFiltering.Pixel,
    });
  }

  override clone() {
    return new BlockBreakParticleBorderRaster(this.width, this.height);
  }

  override execute(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = blockBreakParticleBorderColor;
    ctx.fillRect(1, 0, this.width - 2, blockBreakParticleBorderWidth);
    ctx.fillRect(
      1,
      this.height - blockBreakParticleBorderWidth,
      this.width - 2,
      blockBreakParticleBorderWidth,
    );
    ctx.fillRect(0, 1, blockBreakParticleBorderWidth, this.height - 2);
    ctx.fillRect(
      this.width - blockBreakParticleBorderWidth,
      1,
      blockBreakParticleBorderWidth,
      this.height - 2,
    );
  }
}

export class BlockBreakParticleActor extends ex.Actor {
  private readonly graphic: ex.Graphic;
  private readonly velocity: ex.Vector;
  private readonly durationMs: number;
  private elapsedMs = 0;

  constructor(options: BlockBreakParticleActorOptions) {
    const width = options.graphic.width + blockBreakParticleBorderWidth * 2;
    const height = options.graphic.height + blockBreakParticleBorderWidth * 2;
    super({
      pos: ex.vec(options.pos.x - width / 2, options.pos.y - height / 2),
      anchor: ex.vec(0, 0),
      width,
      height,
      z: blockBreakParticleZ,
    });
    this.graphic = options.graphic;
    this.velocity = options.velocity;
    this.durationMs = options.durationMs;
  }

  override onInitialize() {
    this.addChild(this.createBorderActor());
    this.addChild(this.createFragmentActor());
  }

  override onPostUpdate(_engine: ex.Engine, delta: number) {
    void _engine;
    const seconds = delta / 1000;
    this.elapsedMs += delta;
    this.velocity.y += blockBreakParticleGravity * seconds;
    this.pos.x += this.velocity.x * seconds;
    this.pos.y += this.velocity.y * seconds;
    if (this.elapsedMs < this.durationMs) {
      return;
    }
    this.kill();
  }

  private createBorderActor() {
    const actor = new ex.Actor({
      pos: ex.vec(0, 0),
      anchor: ex.vec(0, 0),
      width: this.width,
      height: this.height,
    });
    actor.graphics.anchor = ex.vec(0, 0);
    actor.graphics.use(new BlockBreakParticleBorderRaster(this.width, this.height));
    return actor;
  }

  private createFragmentActor() {
    const actor = new ex.Actor({
      pos: ex.vec(blockBreakParticleBorderWidth, blockBreakParticleBorderWidth),
      anchor: ex.vec(0, 0),
      width: this.graphic.width,
      height: this.graphic.height,
    });
    actor.graphics.anchor = ex.vec(0, 0);
    actor.graphics.use(this.graphic);
    return actor;
  }
}
