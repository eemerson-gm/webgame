import * as ex from "excalibur";
import { Resources } from "../resource";
import { Data, GameClient } from "../classes/GameClient";
import { clamp } from "lodash";

const approach = (start: number, end: number, amount: number) => {
  if (start < end) {
    return Math.min(start + amount, end);
  }
  return Math.max(start - amount, end);
};

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

  constructor(pos: ex.Vector, tilemap: ex.TileMap, client?: GameClient) {
    const width = 16;
    const height = 16;
    super({
      pos,
      anchor: ex.vec(0, 0),
      width,
      height,
    });
    this.client = client;
    this.tilemap = tilemap;
  }

  override onInitialize(engine: ex.Engine) {
    this.graphics.use(Resources.Player.toSprite());
  }

  private sendPosition() {
    if (!this.client) {
      return;
    }
    this.sendClient(
      "update_player",
      {
        id: this.client.clientId,
        k: {
          l: this.keyLeft,
          r: this.keyRight,
          j: this.keyJump,
        },
        s: {
          h: this.hspeed.toFixed(1),
          v: this.vspeed.toFixed(1),
        },
        x: this.pos.x.toFixed(1),
        y: this.pos.y.toFixed(1),
      },
      {
        x: this.pos.x.toFixed(1),
        y: this.pos.y.toFixed(1),
      }
    );
  }

  private onJump() {
    if (this.vspeed < 0) {
      return;
    }
    this.vspeed = -4;
    this.sendPosition();
  }

  private onLand() {
    this.sendPosition();
  }

  private onMove() {
    if (
      this.keyLeft !== this.previousKeyLeft ||
      this.keyRight !== this.previousKeyRight
    ) {
      this.sendPosition();
      this.previousKeyLeft = this.keyLeft;
      this.previousKeyRight = this.keyRight;
    }
  }

  private sendClient(type: string, payload: Data, playerData?: Data) {
    if (!this.client) {
      return;
    }
    this.client.send(type, payload, playerData);
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

    const sprite_top = y;
    const sprite_bottom = y + this.height;
    const sprite_left = x;
    const sprite_right = x + this.width;

    const collision =
      this.tilemap
        .getTile(Math.floor(sprite_left / 16), Math.floor(sprite_top / 16))
        ?.getGraphics().length ||
      this.tilemap
        .getTile(Math.floor(sprite_right / 16), Math.floor(sprite_top / 16))
        ?.getGraphics().length ||
      this.tilemap
        .getTile(Math.floor(sprite_left / 16), Math.floor(sprite_bottom / 16))
        ?.getGraphics().length ||
      this.tilemap
        .getTile(Math.floor(sprite_right / 16), Math.floor(sprite_bottom / 16))
        ?.getGraphics().length;

    this.pos.x = originalX;
    this.pos.y = originalY;

    return !!collision;
  }

  override onPostUpdate(engine: ex.Engine, delta: number) {
    this.updateControls(engine);
    this.onMove();

    const speed = 1.5;
    const accel = 0.3;
    const gravity = 0.2;
    const deltaTime = delta / 10;

    const keySign = Number(this.keyRight) - Number(this.keyLeft);

    if (keySign !== 0 && this.isGrounded) {
      //changeSprite(objId, "player_walk");
      this.graphics.flipHorizontal = keySign === -1;
    } else if (this.isGrounded) {
      //changeSprite(objId, "player");
    } else {
      //changeSprite(objId, "player_jump");
    }
    this.hspeed = approach(
      this.hspeed,
      keySign * (speed * (this.isRunning ? 2 : 1)),
      accel
    );
    this.vspeed += gravity;

    let moveX = this.hspeed * deltaTime;
    let moveY = this.vspeed * deltaTime;

    if (this.tileMeeting(this.pos.x + moveX, this.pos.y)) {
      let counter = 0;
      while (
        !this.tileMeeting(this.pos.x + Math.sign(moveX), this.pos.y) &&
        counter++ < 16
      ) {
        this.pos.x += Math.sign(moveX);
      }
      this.pos.x = Math.round(this.pos.x / 16) * 16 - Math.sign(moveX) * 0.1;
      moveX = 0;
      this.hspeed = 0;
    }

    if (this.tileMeeting(this.pos.x, this.pos.y + moveY)) {
      let counter = 0;
      while (
        !this.tileMeeting(this.pos.x, this.pos.y + Math.sign(moveY)) &&
        counter++ < 16
      ) {
        this.pos.y += Math.sign(moveY);
      }
      this.pos.y = Math.round(this.pos.y / 16) * 16 - Math.sign(moveY) * 0.1;
      moveY = 0;
      this.vspeed = 0;
    }

    const previousGrounded = this.isGrounded;
    this.isGrounded = this.tileMeeting(this.pos.x, this.pos.y + 1);

    if (this.isGrounded && this.keyJump) {
      this.onJump();
    }
    if (!previousGrounded && this.isGrounded) {
      this.onLand();
    }

    this.pos.x += moveX;
    this.pos.y += moveY;

    this.pos.x = clamp(this.pos.x, 0, 320 - this.width);
    this.pos.y = clamp(this.pos.y, 0, 180 - this.height);
  }
}
