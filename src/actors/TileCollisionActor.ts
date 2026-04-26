import * as ex from "excalibur";

export type CollisionBounds = {
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  edgeInset: number;
};

export class TileCollisionActor extends ex.Actor {
  public hspeed: number = 0;
  public vspeed: number = 0;
  public readonly tilemap: ex.TileMap;
  protected readonly collisionBounds: CollisionBounds;

  constructor(
    pos: ex.Vector,
    tilemap: ex.TileMap,
    size: ex.Vector,
    collisionBounds: CollisionBounds,
  ) {
    super({
      pos,
      anchor: ex.vec(0, 0),
      width: size.x,
      height: size.y,
    });
    this.tilemap = tilemap;
    this.collisionBounds = collisionBounds;
  }

  protected tileMeeting(x: number, y: number) {
    const tw = this.tilemap.tileWidth;
    const th = this.tilemap.tileHeight;
    const bounds = this.collisionBoundsAt(x, y);
    const collision =
      this.tilemap
        .getTile(Math.floor(bounds.left / tw), Math.floor(bounds.top / th))
        ?.getGraphics().length ||
      this.tilemap
        .getTile(Math.floor(bounds.right / tw), Math.floor(bounds.top / th))
        ?.getGraphics().length ||
      this.tilemap
        .getTile(Math.floor(bounds.left / tw), Math.floor(bounds.bottom / th))
        ?.getGraphics().length ||
      this.tilemap
        .getTile(Math.floor(bounds.right / tw), Math.floor(bounds.bottom / th))
        ?.getGraphics().length;

    return !!collision;
  }

  protected moveHorizontallyUntilBlocked(moveX: number) {
    if (!this.tileMeeting(this.pos.x + moveX, this.pos.y)) {
      this.pos.x += moveX;
      return true;
    }
    this.nudgeXUntilBlocked(moveX);
    return false;
  }

  protected moveVerticallyUntilBlocked(moveY: number) {
    if (!this.tileMeeting(this.pos.x, this.pos.y + moveY)) {
      this.pos.y += moveY;
      return true;
    }
    this.nudgeYUntilBlocked(moveY);
    return false;
  }

  private collisionBoundsAt(x: number, y: number) {
    return {
      left: x + this.collisionBounds.offsetX,
      right:
        x +
        this.collisionBounds.offsetX +
        this.collisionBounds.width -
        this.collisionBounds.edgeInset,
      top: y + this.collisionBounds.offsetY,
      bottom:
        y +
        this.collisionBounds.offsetY +
        this.collisionBounds.height -
        this.collisionBounds.edgeInset,
    };
  }

  private nudgeXUntilBlocked(moveX: number) {
    const span = this.tilemap.tileWidth;
    const nudge = (rem: number): void => {
      if (rem <= 0) {
        return;
      }
      if (this.tileMeeting(this.pos.x + Math.sign(moveX), this.pos.y)) {
        return;
      }
      this.pos.x += Math.sign(moveX);
      nudge(rem - 1);
    };
    nudge(span);
  }

  private nudgeYUntilBlocked(moveY: number) {
    const span = this.tilemap.tileHeight;
    const nudge = (rem: number): void => {
      if (rem <= 0) {
        return;
      }
      if (this.tileMeeting(this.pos.x, this.pos.y + Math.sign(moveY))) {
        return;
      }
      this.pos.y += Math.sign(moveY);
      nudge(rem - 1);
    };
    nudge(span);
  }
}
