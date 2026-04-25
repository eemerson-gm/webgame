import * as ex from "excalibur";
import { Resources } from "../resource";
import { Data, GameClient } from "../classes/GameClient";
import { TILE_PX } from "../world/worldConfig";
import { clamp, merge } from "lodash";

const approach = (start: number, end: number, amount: number) => {
  if (start < end) {
    return Math.min(start + amount, end);
  }
  return Math.max(start - amount, end);
};

const localCameraFollowElasticity = 0.14;
const localCameraFollowFriction = 0.22;

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

  override onInitialize(engine: ex.Engine) {
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
    this.sendClient("update_player", {
      kj: true,
    });
  }

  private onLand() {
    this.sendClient("update_player", {
      x: this.pos.x.toFixed(1),
      y: this.pos.y.toFixed(1),
    });
  }

  private onMove() {
    if (
      this.keyLeft !== this.previousKeyLeft ||
      this.keyRight !== this.previousKeyRight ||
      this.keyJump !== this.previousKeyJump
    ) {
      const payload = merge(
        {
          kl: this.keyLeft,
          kr: this.keyRight,
          kj: this.keyJump,
        },
        this.isGrounded
          ? {
              x: this.pos.x.toFixed(1),
            }
          : {},
      );
      this.sendClient("update_player", payload);
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
    const originalX = this.pos.x;
    const originalY = this.pos.y;
    const tw = this.tilemap.tileWidth;
    const th = this.tilemap.tileHeight;

    const sprite_top = y;
    const sprite_bottom = y + this.height;
    const sprite_left = x;
    const sprite_right = x + this.width;

    const collision =
      this.tilemap
        .getTile(Math.floor(sprite_left / tw), Math.floor(sprite_top / th))
        ?.getGraphics().length ||
      this.tilemap
        .getTile(Math.floor(sprite_right / tw), Math.floor(sprite_top / th))
        ?.getGraphics().length ||
      this.tilemap
        .getTile(Math.floor(sprite_left / tw), Math.floor(sprite_bottom / th))
        ?.getGraphics().length ||
      this.tilemap
        .getTile(
          Math.floor(sprite_right / tw),
          Math.floor(sprite_bottom / th),
        )
        ?.getGraphics().length;

    this.pos.x = originalX;
    this.pos.y = originalY;

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

  override onPostUpdate(engine: ex.Engine, delta: number) {
    this.updateControls(engine);
    this.onMove();
    const tw = this.tilemap.tileWidth;
    const th = this.tilemap.tileHeight;

    const speed = 1.5;
    const accel = 0.3;
    const gravity = 0.2;
    const dt = delta / 1000;
    const positionScale = 100;

    const keySign = Number(this.keyRight) - Number(this.keyLeft);

    this.hspeed = approach(
      this.hspeed,
      keySign * (speed * (this.isRunning ? 2 : 1)),
      accel * 60 * dt,
    );
    this.vspeed += gravity * 60 * dt;

    const moveX = this.hspeed * positionScale * dt;
    const moveY = this.vspeed * positionScale * dt;

    const moveXResult = (() => {
      if (!this.tileMeeting(this.pos.x + moveX, this.pos.y)) {
        return moveX;
      }
      this.nudgeXUntilBlocked(moveX);
      this.pos.x =
        Math.round(this.pos.x / tw) * tw - Math.sign(moveX) * 0.1;
      this.hspeed = 0;
      return 0;
    })();

    const moveYResult = (() => {
      if (!this.tileMeeting(this.pos.x, this.pos.y + moveY)) {
        return moveY;
      }
      this.nudgeYUntilBlocked(moveY);
      this.pos.y =
        Math.round(this.pos.y / th) * th - Math.sign(moveY) * 0.1;
      this.vspeed = 0;
      return 0;
    })();

    const previousGrounded = this.isGrounded;
    this.isGrounded = this.tileMeeting(this.pos.x, this.pos.y + 1);

    if (this.isGrounded && this.keyJump) {
      this.onJump();
    }
    if (!previousGrounded && this.isGrounded) {
      this.onLand();
    }

    this.pos.x += moveXResult;
    this.pos.y += moveYResult;

    const maxX = this.tilemap.columns * this.tilemap.tileWidth - this.width;
    const maxY = this.tilemap.rows * this.tilemap.tileHeight - this.height;
    this.pos.x = clamp(this.pos.x, 0, maxX);
    this.pos.y = clamp(this.pos.y, 0, maxY);

    this.syncPlayerVisuals(keySign);
  }
}
