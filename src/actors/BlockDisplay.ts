import * as ex from "excalibur";

export const blockDisplaySpriteSize = 10;
const blockDisplayOutlineWidth = 1;
export const blockDisplaySize = blockDisplaySpriteSize + blockDisplayOutlineWidth * 2;
const blockDisplaySourceEdgeCut = 1;
const blockDisplayOutlineColor = "#000000";

class BlockDisplayOutlineRaster extends ex.Raster {
  constructor() {
    super({
      width: blockDisplaySize,
      height: blockDisplaySize,
      origin: ex.vec(0, 0),
      smoothing: false,
      filtering: ex.ImageFiltering.Pixel,
    });
  }

  override clone() {
    return new BlockDisplayOutlineRaster();
  }

  override execute(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = blockDisplayOutlineColor;
    ctx.fillRect(1, 0, blockDisplaySpriteSize, blockDisplayOutlineWidth);
    ctx.fillRect(1, blockDisplaySize - 1, blockDisplaySpriteSize, blockDisplayOutlineWidth);
    ctx.fillRect(0, 1, blockDisplayOutlineWidth, blockDisplaySpriteSize);
    ctx.fillRect(blockDisplaySize - 1, 1, blockDisplayOutlineWidth, blockDisplaySpriteSize);
  }
}

export class BlockDisplay extends ex.Actor {
  private readonly image: ex.ImageSource;
  private outlineActor: ex.Actor | null = null;
  private blockActor: ex.Actor | null = null;
  private isDisplayVisible: boolean = true;

  constructor(image: ex.ImageSource, pos: ex.Vector = ex.vec(0, 0)) {
    super({
      pos,
      anchor: ex.vec(0, 0),
      width: blockDisplaySize,
      height: blockDisplaySize,
    });
    this.image = image;
  }

  override onInitialize() {
    const sprite = this.createBlockSprite();
    const outline = new ex.Actor({
      pos: ex.vec(0, 0),
      anchor: ex.vec(0, 0),
      width: blockDisplaySize,
      height: blockDisplaySize,
    });
    const block = new ex.Actor({
      pos: ex.vec(blockDisplayOutlineWidth, blockDisplayOutlineWidth),
      anchor: ex.vec(0, 0),
      width: blockDisplaySpriteSize,
      height: blockDisplaySpriteSize,
    });
    outline.graphics.anchor = ex.vec(0, 0);
    block.graphics.anchor = ex.vec(0, 0);
    outline.graphics.use(new BlockDisplayOutlineRaster());
    block.graphics.use(sprite);
    this.outlineActor = outline;
    this.blockActor = block;
    this.syncDisplayVisibility();
    this.addChild(outline);
    this.addChild(block);
  }

  public setDisplayVisible(isVisible: boolean) {
    this.isDisplayVisible = isVisible;
    this.syncDisplayVisibility();
  }

  private createBlockSprite() {
    const sprite = this.image.toSprite();
    const sourceWidth = sprite.width - blockDisplaySourceEdgeCut * 2;
    const sourceHeight = sprite.height - blockDisplaySourceEdgeCut * 2;
    const sourceX =
      blockDisplaySourceEdgeCut +
      Math.floor((sourceWidth - blockDisplaySpriteSize) / 2);
    const sourceY =
      blockDisplaySourceEdgeCut +
      Math.floor((sourceHeight - blockDisplaySpriteSize) / 2);
    return new ex.Sprite({
      image: this.image,
      sourceView: {
        x: sourceX,
        y: sourceY,
        width: blockDisplaySpriteSize,
        height: blockDisplaySpriteSize,
      },
    });
  }

  private syncDisplayVisibility() {
    if (this.outlineActor) {
      this.outlineActor.graphics.visible = this.isDisplayVisible;
    }
    if (this.blockActor) {
      this.blockActor.graphics.visible = this.isDisplayVisible;
    }
  }
}
