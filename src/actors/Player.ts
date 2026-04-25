import * as ex from "excalibur";
import { Resources } from "../resource";
import { GameClient } from "../classes/GameClient";
import { Data, messageTypes } from "../classes/GameProtocol";
import { TILE_PX } from "../world/worldConfig";
import { clamp } from "lodash";

const approach = (start: number, end: number, amount: number) => {
  if (start < end) {
    return Math.min(start + amount, end);
  }
  return Math.max(start - amount, end);
};

const localCameraFollowElasticity = 0.14;
const localCameraFollowFriction = 0.22;
const collisionWidth = TILE_PX - 4;
const collisionHeight = TILE_PX - 2;
const collisionOffsetX = (TILE_PX - collisionWidth) / 2;
const collisionOffsetY = TILE_PX - collisionHeight;
const collisionEdgeInset = 0.1;
const walkSpeed = 1.25;
const runSpeedMultiplier = 2;
const walkAcceleration = 0.25;
const stopDeceleration = 0.22;
const turnAcceleration = 0.32;
const gravity = 0.2;
const positionScale = 100;

export class Player extends ex.Actor {
  private client?: GameClient;
  hspeed: number = 0;
  vspeed: number = 0;
  isLocal: boolean;
  isRunning: boolean = false;
  isJumping: boolean = false;
  isGrounded: boolean = false;
  keyLeft: boolean = false;
  keyRight: boolean = false;
  keyJump: boolean = false;
  previousKeyLeft: boolean = false;
  previousKeyRight: boolean = false;
  previousKeyJump: boolean = false;
  tilemap: ex.TileMap;
  private idleSprite: ex.Sprite;
  private jumpSprite: ex.Sprite;
  private walkAnimation: ex.Animation;
  private currentVisual: "idle" | "walk" | "jump" = "idle";
  private facingLeft: boolean = false;

  constructor(pos: ex.Vector, tilemap: ex.TileMap, client?: GameClient) {
    const width = TILE_PX;
    const height = TILE_PX;
    super({
      pos,
      anchor: ex.vec(0, 0),
      width,
      height,
    });
    this.client = client;
    this.tilemap = tilemap;
    this.idleSprite = Resources.Player.toSprite();
    this.jumpSprite = Resources.PlayerJump.toSprite();
    this.walkAnimation = new ex.Animation({
      frames: [
        { graphic: Resources.PlayerWalk1.toSprite() },
        { graphic: Resources.PlayerWalk2.toSprite() },
      ],
      frameDuration: 120,
      strategy: ex.AnimationStrategy.Loop,
    });
  }

  private collisionBoundsAt(x: number, y: number) {
    return {
      left: x + collisionOffsetX,
      right: x + collisionOffsetX + collisionWidth - collisionEdgeInset,
      top: y + collisionOffsetY,
      bottom: y + collisionOffsetY + collisionHeight - collisionEdgeInset,
    };
  }

  override onInitialize() {
    this.walkAnimation.pause();
    this.graphics.use(this.idleSprite);
    if (this.client && this.scene) {
      const worldWidthPx = this.tilemap.columns * this.tilemap.tileWidth;
      const worldHeightPx = this.tilemap.rows * this.tilemap.tileHeight;
      const worldBounds = new ex.BoundingBox(0, 0, worldWidthPx, worldHeightPx);
      this.scene.camera.strategy.elasticToActor(
        this,
        localCameraFollowElasticity,
        localCameraFollowFriction,
      );
      this.scene.camera.strategy.limitCameraBounds(worldBounds);
    }
  }

  private sendClient(type: string, payload: Data, playerData?: Data) {
    if (!this.client) {
      return;
    }
    this.client.send(type, payload, playerData);
  }

  private onJump() {
    if (this.vspeed < 0) {
      return;
    }
    this.vspeed = -4;
    this.sendClient(messageTypes.updatePlayer, {
      keyJump: true,
    });
  }

  private onLand() {
    const position = {
      x: this.pos.x.toFixed(1),
      y: this.pos.y.toFixed(1),
    };
    this.sendClient(messageTypes.updatePlayer, position, position);
  }

  private onMove() {
    if (
      this.keyLeft !== this.previousKeyLeft ||
      this.keyRight !== this.previousKeyRight ||
      this.keyJump !== this.previousKeyJump
    ) {
      const position = this.isGrounded
        ? {
            x: this.pos.x.toFixed(1),
          }
        : {};
      const payload = {
        keyLeft: this.keyLeft,
        keyRight: this.keyRight,
        keyJump: this.keyJump,
        ...position,
      };
      const statePatch = this.isGrounded ? position : undefined;
      this.sendClient(messageTypes.updatePlayer, payload, statePatch);
      this.previousKeyLeft = this.keyLeft;
      this.previousKeyRight = this.keyRight;
      this.previousKeyJump = this.keyJump;
    }
  }

  private updateControls(engine: ex.Engine) {
    if (!this.client) {
      return;
    }
    this.keyLeft = engine.input.keyboard.isHeld(ex.Keys.A);
    this.keyRight = engine.input.keyboard.isHeld(ex.Keys.D);
    this.keyJump = engine.input.keyboard.isHeld(ex.Keys.Space);
  }

  private tileMeeting(x: number, y: number) {
    const tw = this.tilemap.tileWidth;
    const th = this.tilemap.tileHeight;

    const collisionBounds = this.collisionBoundsAt(x, y);

    const collision =
      this.tilemap
        .getTile(
          Math.floor(collisionBounds.left / tw),
          Math.floor(collisionBounds.top / th),
        )
        ?.getGraphics().length ||
      this.tilemap
        .getTile(
          Math.floor(collisionBounds.right / tw),
          Math.floor(collisionBounds.top / th),
        )
        ?.getGraphics().length ||
      this.tilemap
        .getTile(
          Math.floor(collisionBounds.left / tw),
          Math.floor(collisionBounds.bottom / th),
        )
        ?.getGraphics().length ||
      this.tilemap
        .getTile(
          Math.floor(collisionBounds.right / tw),
          Math.floor(collisionBounds.bottom / th),
        )
        ?.getGraphics().length;

    return !!collision;
  }

  private syncPlayerVisuals(keySign: number) {
    const nextVisual: "idle" | "walk" | "jump" = !this.isGrounded
      ? "jump"
      : keySign !== 0
        ? "walk"
        : "idle";
    if (nextVisual !== this.currentVisual) {
      if (this.currentVisual === "walk") {
        this.walkAnimation.pause();
      }
      this.currentVisual = nextVisual;
      if (nextVisual === "idle") {
        this.graphics.use(this.idleSprite);
      }
      if (nextVisual === "walk") {
        this.walkAnimation.reset();
        this.graphics.use(this.walkAnimation);
        this.walkAnimation.play();
      }
      if (nextVisual === "jump") {
        this.graphics.use(this.jumpSprite);
      }
    }
    if (keySign !== 0) {
      this.facingLeft = keySign === -1;
    }
    this.graphics.flipHorizontal = this.facingLeft;
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
    const span = this.tilemap.tileWidth;
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

  private moveHorizontally(moveX: number) {
    if (!this.tileMeeting(this.pos.x + moveX, this.pos.y)) {
      this.pos.x += moveX;
      return;
    }
    this.nudgeXUntilBlocked(moveX);
    this.hspeed = 0;
  }

  private moveVertically(moveY: number) {
    if (!this.tileMeeting(this.pos.x, this.pos.y + moveY)) {
      this.pos.y += moveY;
      return;
    }
    this.nudgeYUntilBlocked(moveY);
    this.vspeed = 0;
  }

  private horizontalAccelerationFor(keySign: number) {
    if (keySign === 0) {
      return stopDeceleration;
    }
    if (Math.sign(this.hspeed) !== 0 && Math.sign(this.hspeed) !== keySign) {
      return turnAcceleration;
    }
    return walkAcceleration;
  }

  override onPostUpdate(engine: ex.Engine, delta: number) {
    this.updateControls(engine);
    this.onMove();

    const dt = delta / 1000;

    const keySign = Number(this.keyRight) - Number(this.keyLeft);
    const targetHspeed =
      keySign * walkSpeed * (this.isRunning ? runSpeedMultiplier : 1);
    const horizontalAcceleration = this.horizontalAccelerationFor(keySign);

    this.hspeed = approach(
      this.hspeed,
      targetHspeed,
      horizontalAcceleration * 60 * dt,
    );
    this.vspeed += gravity * 60 * dt;

    const moveX = this.hspeed * positionScale * dt;
    const moveY = this.vspeed * positionScale * dt;

    this.moveHorizontally(moveX);
    this.moveVertically(moveY);

    const previousGrounded = this.isGrounded;
    this.isGrounded = this.tileMeeting(this.pos.x, this.pos.y + 1);

    if (this.isGrounded && this.keyJump) {
      this.onJump();
    }
    if (!previousGrounded && this.isGrounded) {
      this.onLand();
    }

    const maxX =
      this.tilemap.columns * this.tilemap.tileWidth -
      collisionOffsetX -
      collisionWidth;
    const maxY =
      this.tilemap.rows * this.tilemap.tileHeight -
      collisionOffsetY -
      collisionHeight;
    this.pos.x = clamp(this.pos.x, -collisionOffsetX, maxX);
    this.pos.y = clamp(this.pos.y, -collisionOffsetY, maxY);

    this.syncPlayerVisuals(keySign);
  }
}
