import * as ex from "excalibur";
import { TileCollisionActor } from "./TileCollisionActor";
import type { CollisionBounds } from "./TileCollisionActor";
import {
  applyGravity as applyEntityGravity,
  overlapsWorldBounds as entityOverlapsWorldBounds,
  stepEntityFreely,
  stepEntityWithVelocity,
} from "../simulation/entityPhysics";
import type { EntityPhysicsState, WorldBounds } from "../simulation/entityPhysics";

export type { WorldBounds } from "../simulation/entityPhysics";

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
    return entityOverlapsWorldBounds(this.entityPhysicsState(), bounds);
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
    this.vspeed = applyEntityGravity(this.vspeed, gravity, dt);
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

  private applyEntityPhysicsState(state: EntityPhysicsState) {
    this.pos.x = state.x;
    this.pos.y = state.y;
    this.hspeed = state.horizontalSpeed;
    this.vspeed = state.verticalSpeed;
    this.isGrounded = state.isGrounded;
    this.isJumping = state.isJumping;
  }
}
