import * as ex from "excalibur";
import { TileCollisionActor } from "./TileCollisionActor";
import type { CollisionBounds } from "./TileCollisionActor";

export type WorldBounds = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export class MovingActor extends TileCollisionActor {
  public isGrounded: boolean = false;
  public isRunning: boolean = false;
  public isJumping: boolean = false;
  protected facingLeft: boolean = false;

  constructor(
    pos: ex.Vector,
    tilemap: ex.TileMap,
    size: ex.Vector,
    collisionBounds: CollisionBounds,
  ) {
    super(pos, tilemap, size, collisionBounds);
  }

  public containsWorldPoint(point: ex.Vector) {
    if (point.x < this.pos.x) {
      return false;
    }
    if (point.y < this.pos.y) {
      return false;
    }
    if (point.x > this.pos.x + this.width) {
      return false;
    }
    return point.y <= this.pos.y + this.height;
  }

  public overlapsWorldBounds(bounds: WorldBounds) {
    if (this.pos.x + this.width < bounds.left) {
      return false;
    }
    if (this.pos.x > bounds.right) {
      return false;
    }
    if (this.pos.y + this.height < bounds.top) {
      return false;
    }
    return this.pos.y <= bounds.bottom;
  }

  protected centerX() {
    return this.pos.x + this.width / 2;
  }

  protected centerY() {
    return this.pos.y + this.height / 2;
  }

  protected horizontalSignTo(entity: ex.Actor) {
    return Math.sign(entity.pos.x + entity.width / 2 - this.centerX());
  }

  protected syncFacingFromHorizontalSign(horizontalSign: number) {
    if (horizontalSign === 0) {
      return;
    }
    this.facingLeft = horizontalSign === -1;
  }

  protected jump(jumpSpeed: number) {
    if (!this.isGrounded) {
      return false;
    }
    this.vspeed = jumpSpeed;
    this.isGrounded = false;
    this.isJumping = true;
    return true;
  }

  protected applyGravity(gravity: number, dt: number) {
    this.vspeed += gravity * 60 * dt;
  }

  protected stayInsideWorldBounds() {
    const worldWidth = this.tilemap.columns * this.tilemap.tileWidth;
    const worldHeight = this.tilemap.rows * this.tilemap.tileHeight;
    const minX = -this.collisionBounds.offsetX;
    const maxX =
      worldWidth - this.collisionBounds.offsetX - this.collisionBounds.width;
    const minY = -this.collisionBounds.offsetY;
    const maxY =
      worldHeight - this.collisionBounds.offsetY - this.collisionBounds.height;
    const clampedX = Math.min(Math.max(this.pos.x, minX), maxX);
    const clampedY = Math.min(Math.max(this.pos.y, minY), maxY);
    if (clampedX !== this.pos.x) {
      this.hspeed = 0;
    }
    if (clampedY !== this.pos.y) {
      this.vspeed = 0;
    }
    this.pos.x = clampedX;
    this.pos.y = clampedY;
  }

  protected moveWithVelocity(positionScale: number, dt: number) {
    const moveX = this.hspeed * positionScale * dt;
    const moveY = this.vspeed * positionScale * dt;
    if (!this.moveHorizontallyUntilBlocked(moveX)) {
      this.hspeed = 0;
    }
    if (!this.moveVerticallyUntilBlocked(moveY)) {
      this.vspeed = 0;
    }
    this.stayInsideWorldBounds();
    this.isGrounded = this.tileMeeting(this.pos.x, this.pos.y + 1);
    if (this.isGrounded) {
      this.isJumping = false;
    }
  }

  protected moveFreely(positionScale: number, dt: number) {
    this.pos.x += this.hspeed * positionScale * dt;
    this.pos.y += this.vspeed * positionScale * dt;
    this.stayInsideWorldBounds();
    this.isGrounded = false;
  }
}
