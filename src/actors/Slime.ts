import * as ex from "excalibur";
import { Resources } from "../resource";
import { TILE_PX } from "../world/worldConfig";
import type { Player } from "./Player";
import { MovingActor } from "./MovingActor";

const gravity = 0.2;
const positionScale = 100;
const friction = 0.9;
const chaseSpeed = 0.75;
const chaseAcceleration = 0.08;
const stopDistance = TILE_PX * 0.4;
const jumpSpeed = -3.2;
const knockbackHorizontalSpeed = 2.2;
const knockbackVerticalSpeed = -1.4;
const knockbackDurationMs = 240;
const collisionEdgeInset = 0.1;

type PlayerProvider = () => Player | null;

const approach = (start: number, end: number, amount: number) => {
  if (start < end) {
    return Math.min(start + amount, end);
  }
  return Math.max(start - amount, end);
};

export class Slime extends MovingActor {
  private readonly getTargetPlayer: PlayerProvider;
  private knockbackTimeRemainingMs: number = 0;

  constructor(
    pos: ex.Vector,
    tilemap: ex.TileMap,
    getTargetPlayer: PlayerProvider,
  ) {
    super(pos, tilemap, ex.vec(TILE_PX, TILE_PX), {
      offsetX: 0,
      offsetY: 0,
      width: TILE_PX,
      height: TILE_PX,
      edgeInset: collisionEdgeInset,
    });
    this.getTargetPlayer = getTargetPlayer;
    this.graphics.use(Resources.Slime.toSprite());
  }

  public isWithinSwordRangeOf(player: Player) {
    const playerCenterX = player.pos.x + player.width / 2;
    const playerCenterY = player.pos.y + player.height / 2;
    const slimeCenterX = this.centerX();
    const slimeCenterY = this.centerY();
    const distance = Math.hypot(
      slimeCenterX - playerCenterX,
      slimeCenterY - playerCenterY,
    );
    return distance <= TILE_PX * 2.5;
  }

  public knockBackFrom(player: Player) {
    const playerCenterX = player.pos.x + player.width / 2;
    const slimeCenterX = this.centerX();
    const direction = slimeCenterX < playerCenterX ? -1 : 1;
    this.hspeed = knockbackHorizontalSpeed * direction;
    this.vspeed = knockbackVerticalSpeed;
    this.knockbackTimeRemainingMs = knockbackDurationMs;
  }

  override onPostUpdate(_engine: ex.Engine, delta: number) {
    const dt = delta / 1000;
    this.updateChase(delta);
    this.applyGravity(gravity, dt);
    this.moveWithVelocity(positionScale, dt);
    if (this.knockbackTimeRemainingMs > 0) {
      this.hspeed *= friction;
      return;
    }
    if (!this.getTargetPlayer()) {
      this.hspeed *= friction;
    }
  }

  private updateChase(delta: number) {
    if (this.knockbackTimeRemainingMs > 0) {
      this.knockbackTimeRemainingMs = Math.max(
        this.knockbackTimeRemainingMs - delta,
        0,
      );
      return;
    }
    const player = this.getTargetPlayer();
    if (!player) {
      return;
    }
    const playerCenterX = player.pos.x + player.width / 2;
    const playerCenterY = player.pos.y + player.height / 2;
    const slimeCenterX = this.centerX();
    const slimeCenterY = this.centerY();
    const distanceX = playerCenterX - slimeCenterX;
    const direction = this.horizontalSignTo(player);
    this.syncFacingFromHorizontalSign(direction);
    const targetSpeed =
      Math.abs(distanceX) <= stopDistance ? 0 : direction * chaseSpeed;
    this.hspeed = approach(this.hspeed, targetSpeed, chaseAcceleration);
    if (this.shouldJumpToward(playerCenterY, slimeCenterY, direction)) {
      this.jump(jumpSpeed);
    }
  }

  private shouldJumpToward(
    playerCenterY: number,
    slimeCenterY: number,
    direction: number,
  ) {
    if (!this.tileMeeting(this.pos.x, this.pos.y + 1)) {
      return false;
    }
    if (playerCenterY < slimeCenterY - TILE_PX * 0.5) {
      return true;
    }
    if (direction === 0) {
      return false;
    }
    return this.tileMeeting(this.pos.x + direction * 2, this.pos.y);
  }
}
