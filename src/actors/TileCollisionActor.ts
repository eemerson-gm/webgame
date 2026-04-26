import * as ex from "excalibur";
import {
  moveHorizontallyUntilBlocked as moveEntityHorizontallyUntilBlocked,
  moveVerticallyUntilBlocked as moveEntityVerticallyUntilBlocked,
  tileMeeting as entityTileMeeting,
} from "../simulation/entityPhysics";
import type {
  CollisionBounds,
  EntityPhysicsOptions,
  TileCollisionWorld,
} from "../simulation/entityPhysics";

export type { CollisionBounds } from "../simulation/entityPhysics";

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
      z: 2,
    });
    this.tilemap = tilemap;
    this.collisionBounds = collisionBounds;
  }

  protected tileMeeting(x: number, y: number) {
    return entityTileMeeting(x, y, this.entityPhysicsOptions());
  }

  protected moveHorizontallyUntilBlocked(moveX: number) {
    const move = moveEntityHorizontallyUntilBlocked(
      this.pos.x,
      this.pos.y,
      moveX,
      this.entityPhysicsOptions(),
    );
    this.pos.x = move.x;
    return !move.isBlocked;
  }

  protected moveVerticallyUntilBlocked(moveY: number) {
    const move = moveEntityVerticallyUntilBlocked(
      this.pos.x,
      this.pos.y,
      moveY,
      this.entityPhysicsOptions(),
    );
    this.pos.y = move.y;
    return !move.isBlocked;
  }

  protected entityPhysicsOptions(): EntityPhysicsOptions {
    return {
      collisionBounds: this.collisionBounds,
      world: this.tileCollisionWorld(),
    };
  }

  private tileCollisionWorld(): TileCollisionWorld {
    return {
      tileWidth: this.tilemap.tileWidth,
      tileHeight: this.tilemap.tileHeight,
      columns: this.tilemap.columns,
      rows: this.tilemap.rows,
      isSolidTile: (column, row) =>
        !!this.tilemap.getTile(column, row)?.getGraphics().length,
    };
  }
}
