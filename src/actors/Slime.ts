import * as ex from "excalibur";
import { TILE_PX } from "../world/worldConfig";
import {
  WalkingActor,
  collisionOffsetForGraphicCenter,
  type WalkingTuning,
} from "./WalkingActor";
import {
  entityCenterX,
  entityCenterY,
  horizontalSignBetween,
  tileMeeting,
  type EntityPhysicsOptions,
  type EntitySeparationBody,
  type TileCollisionWorld,
} from "./MovingActor";
import { SlimeVisuals } from "./slime/SlimeVisuals";
import type { LocomotionVisualsHost } from "./walking/LocomotionVisuals";
import type { Player } from "./Player";

const slimeWalkingTuning: WalkingTuning = {
  walkSpeed: 0.9,
  walkAcceleration: 0.22,
  stopDeceleration: 0.2,
  turnAcceleration: 0.28,
  gravity: 0.2,
  jumpSpeed: -2.6,
  positionScale: 100,
};

const followStopDistance = TILE_PX * 0.75;
const followJumpHorizontalDistance = TILE_PX * 2.5;
const followJumpVerticalOffset = TILE_PX * 0.5;

export class Slime extends WalkingActor {
  private readonly visuals: SlimeVisuals;
  private readonly followTarget: Player;

  constructor(
    pos: ex.Vector,
    tilemap: ex.TileMap,
    collisionWorld: TileCollisionWorld,
    followTarget: Player,
  ) {
    const width = TILE_PX;
    const height = TILE_PX;
    super(
      pos,
      tilemap,
      ex.vec(width, height),
      collisionOffsetForGraphicCenter(ex.vec(TILE_PX / 2, TILE_PX / 2)),
      slimeWalkingTuning,
      collisionWorld,
    );
    this.followTarget = followTarget;
    this.visuals = new SlimeVisuals(this);
  }

  public entityId() {
    return "slime:test";
  }

  public entitySeparationBody(
    entityId: string,
    canSeparate: boolean,
  ): EntitySeparationBody {
    return {
      id: `entity:${entityId}`,
      x: this.pos.x,
      y: this.pos.y,
      horizontalSpeed: this.hspeed,
      verticalSpeed: this.vspeed,
      width: this.width,
      height: this.height,
      isGrounded: this.isGrounded,
      isJumping: this.isJumping,
      collisionBounds: this.collisionBounds,
      canSeparate,
    };
  }

  public applySeparatedX(x: number) {
    if (this.pos.x === x) {
      return;
    }
    this.pos.x = x;
  }

  protected locomotionVisuals(): LocomotionVisualsHost {
    return this.visuals;
  }

  protected horizontalMoveSign() {
    return this.followMoveSign();
  }

  protected tryJump() {
    if (!this.shouldFollowJump()) {
      return;
    }
    this.jump(this.walkingTuning.jumpSpeed);
  }

  override onInitialize() {
    this.visuals.initialize();
    this.syncCollisionToSprite();
  }

  private followMoveSign() {
    if (this.followTarget.isPaused) {
      return 0;
    }
    const targetX = entityCenterX({
      x: this.followTarget.pos.x,
      width: this.followTarget.width,
    });
    const horizontalDistance = Math.abs(this.centerX() - targetX);
    if (horizontalDistance <= followStopDistance) {
      return 0;
    }
    return horizontalSignBetween(
      { x: this.pos.x, width: this.width },
      { x: this.followTarget.pos.x, width: this.followTarget.width },
    );
  }

  private shouldFollowJump() {
    if (!this.isGrounded) {
      return false;
    }
    if (this.followTarget.isPaused) {
      return false;
    }
    const moveSign = this.followMoveSign();
    if (moveSign === 0) {
      return false;
    }
    const physicsOptions = this.followPhysicsOptions();
    if (this.shouldJumpForTileAhead(moveSign, physicsOptions)) {
      return true;
    }
    const targetX = entityCenterX({
      x: this.followTarget.pos.x,
      width: this.followTarget.width,
    });
    const targetY = entityCenterY({
      y: this.followTarget.pos.y,
      height: this.followTarget.height,
    });
    const horizontalDistance = Math.abs(this.centerX() - targetX);
    if (horizontalDistance > followJumpHorizontalDistance) {
      return false;
    }
    return targetY < this.centerY() - followJumpVerticalOffset;
  }

  private followPhysicsOptions(): EntityPhysicsOptions {
    return {
      collisionBounds: this.collisionBounds,
      world: this.tileCollisionWorld(),
    };
  }

  private shouldJumpForTileAhead(
    moveSign: number,
    physicsOptions: EntityPhysicsOptions,
  ) {
    const probeX = this.pos.x + moveSign * TILE_PX;
    if (tileMeeting(this.pos.x, this.pos.y - TILE_PX, physicsOptions)) {
      return false;
    }
    return this.hasWallAhead(probeX, physicsOptions);
  }

  private hasWallAhead(probeX: number, physicsOptions: EntityPhysicsOptions) {
    if (!tileMeeting(probeX, this.pos.y, physicsOptions)) {
      return false;
    }
    return !tileMeeting(probeX, this.pos.y - TILE_PX, physicsOptions);
  }

  override onPostUpdate(_engine: ex.Engine, delta: number) {
    this.tickWalkingFrame(delta);
  }
}
