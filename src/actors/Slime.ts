import * as ex from "excalibur";
import { Resources } from "../resource";
import { TILE_PX } from "../world/worldConfig";
import type { Player } from "./Player";
import { TileCollisionActor } from "./TileCollisionActor";

const gravity = 0.2;
const positionScale = 100;
const friction = 0.9;
const knockbackHorizontalSpeed = 2.2;
const knockbackVerticalSpeed = -1.4;
const collisionEdgeInset = 0.1;

export class Slime extends TileCollisionActor {
  constructor(pos: ex.Vector, tilemap: ex.TileMap) {
    super(pos, tilemap, ex.vec(TILE_PX, TILE_PX), {
      offsetX: 0,
      offsetY: 0,
      width: TILE_PX,
      height: TILE_PX,
      edgeInset: collisionEdgeInset,
    });
    this.graphics.use(Resources.Slime.toSprite());
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

  public isWithinSwordRangeOf(player: Player) {
    const playerCenterX = player.pos.x + player.width / 2;
    const playerCenterY = player.pos.y + player.height / 2;
    const slimeCenterX = this.pos.x + this.width / 2;
    const slimeCenterY = this.pos.y + this.height / 2;
    const distance = Math.hypot(
      slimeCenterX - playerCenterX,
      slimeCenterY - playerCenterY,
    );
    return distance <= TILE_PX * 2.5;
  }

  public knockBackFrom(player: Player) {
    const playerCenterX = player.pos.x + player.width / 2;
    const slimeCenterX = this.pos.x + this.width / 2;
    const direction = slimeCenterX < playerCenterX ? -1 : 1;
    this.hspeed = knockbackHorizontalSpeed * direction;
    this.vspeed = knockbackVerticalSpeed;
  }

  override onPostUpdate(_engine: ex.Engine, delta: number) {
    const dt = delta / 1000;
    this.vspeed += gravity * 60 * dt;
    this.moveHorizontally(this.hspeed * positionScale * dt);
    this.moveVertically(this.vspeed * positionScale * dt);
    this.hspeed *= friction;
  }

}
