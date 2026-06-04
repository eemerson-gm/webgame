import * as ex from "excalibur";
export * from "../physics/entityPhysics";
import {
  applyGravity,
  overlapsWorldBounds,
  stepEntityFreely,
  stepEntityWithVelocity,
  tileMeeting,
  type CollisionBounds,
  type EntityPhysicsOptions,
  type EntityPhysicsState,
  type TileCollisionWorld,
  type WorldBounds,
} from "../physics/entityPhysics";

export class MovingActor extends ex.Actor {
  public hspeed: number = 0;
  public vspeed: number = 0;
  public readonly tilemap: ex.TileMap;
  protected readonly collisionBounds: CollisionBounds;
  private readonly collisionWorld?: TileCollisionWorld;

  public isGrounded: boolean = false;
  public isRunning: boolean = false;
  public isJumping: boolean = false;
  protected facingLeft: boolean = false;

  constructor(
    pos: ex.Vector,
    tilemap: ex.TileMap,
    size: ex.Vector,
    collisionBounds: CollisionBounds,
    collisionWorld?: TileCollisionWorld,
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
    this.collisionWorld = collisionWorld;
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
    return overlapsWorldBounds(this.entityCollisionState(), bounds);
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
    this.vspeed = applyGravity(this.vspeed, gravity, dt);
  }

  protected moveWithVelocity(positionScale: number, dt: number) {
    this.applyEntityPhysicsState(
      stepEntityWithVelocity(this.entityPhysicsState(), {
        ...this.entityPhysicsOptions(),
        positionScale,
        dt,
      }),
    );
  }

  protected moveFreely(positionScale: number, dt: number) {
    this.applyEntityPhysicsState(
      stepEntityFreely(this.entityPhysicsState(), {
        ...this.entityPhysicsOptions(),
        positionScale,
        dt,
      }),
    );
  }

  protected entityTileMeeting(x: number, y: number) {
    return tileMeeting(x, y, this.entityPhysicsOptions());
  }

  private entityPhysicsState(): EntityPhysicsState {
    return {
      x: this.pos.x,
      y: this.pos.y,
      horizontalSpeed: this.hspeed,
      verticalSpeed: this.vspeed,
      width: this.width,
      height: this.height,
      isGrounded: this.isGrounded,
      isJumping: this.isJumping,
    };
  }

  private entityCollisionState() {
    return {
      x: this.pos.x + this.collisionBounds.offsetX,
      y: this.pos.y + this.collisionBounds.offsetY,
      width: this.collisionBounds.width,
      height: this.collisionBounds.height,
    };
  }

  protected entityPhysicsOptions(): EntityPhysicsOptions {
    return {
      collisionBounds: this.collisionBounds,
      world: this.tileCollisionWorld(),
    };
  }

  protected tileCollisionWorld(): TileCollisionWorld {
    if (this.collisionWorld) {
      return this.collisionWorld;
    }
    return {
      tileWidth: this.tilemap.tileWidth,
      tileHeight: this.tilemap.tileHeight,
      columns: this.tilemap.columns,
      rows: this.tilemap.rows,
      isSolidTile: (column, row) =>
        !!this.tilemap.getTile(column, row)?.getGraphics().length,
    };
  }

  private applyEntityPhysicsState(state: EntityPhysicsState) {
    this.pos.x = state.x;
    this.pos.y = state.y;
    this.hspeed = state.horizontalSpeed;
    this.vspeed = state.verticalSpeed;
    this.isGrounded = state.isGrounded;
    this.isJumping = state.isJumping;
  }
}
