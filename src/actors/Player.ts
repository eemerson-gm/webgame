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
const flySpeed = 2.4;
const flyAcceleration = 0.45;
const flyToggleKeys = ["ControlLeft", "ControlRight", "Control"];
const positionPrecision = 1000;
const useToolFrameDurationMs = 90;
const useToolFrameCount = 5;
const useToolDurationMs = useToolFrameDurationMs * useToolFrameCount;
const useToolSpeedMultiplier = 0.35;
type PlayerVisual = "idle" | "walk" | "jump" | "crouch" | "lookUp" | "useTool";

const syncedPositionValue = (value: number) =>
  Math.round(value * positionPrecision) / positionPrecision;

export class Player extends ex.Actor {
  private client?: GameClient;
  hspeed: number = 0;
  vspeed: number = 0;
  isLocal: boolean;
  isRunning: boolean = false;
  isJumping: boolean = false;
  isFlying: boolean = false;
  isUsingTool: boolean = false;
  isGrounded: boolean = false;
  keyLeft: boolean = false;
  keyRight: boolean = false;
  keyJump: boolean = false;
  keyDown: boolean = false;
  keyUp: boolean = false;
  previousKeyLeft: boolean = false;
  previousKeyRight: boolean = false;
  previousKeyJump: boolean = false;
  previousKeyDown: boolean = false;
  previousKeyUp: boolean = false;
  previousIsFlying: boolean = false;
  tilemap: ex.TileMap;
  private idleSprite: ex.Sprite;
  private jumpSprite: ex.Sprite;
  private crouchSprite: ex.Sprite;
  private lookUpSprite: ex.Sprite;
  private walkAnimation: ex.Animation;
  private useToolAnimation: ex.Animation;
  private currentVisual: PlayerVisual = "idle";
  private facingLeft: boolean = false;
  private useToolTimeRemainingMs: number = 0;

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
    this.crouchSprite = Resources.PlayerCrouch.toSprite();
    this.lookUpSprite = Resources.PlayerLookUp.toSprite();
    this.useToolAnimation = new ex.Animation({
      frames: [
        { graphic: Resources.PlayerUseTool1.toSprite() },
        { graphic: Resources.PlayerUseTool2.toSprite() },
        { graphic: Resources.PlayerUseTool3.toSprite() },
        { graphic: Resources.PlayerUseTool4.toSprite() },
        { graphic: Resources.PlayerUseTool5.toSprite() },
      ],
      frameDuration: useToolFrameDurationMs,
      strategy: ex.AnimationStrategy.Loop,
    });
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
    this.syncPosition();
  }

  private sendToolUseState(isUsingTool: boolean) {
    const position = this.currentPosition();
    this.sendClient(
      messageTypes.updatePlayer,
      {
        isUsingTool,
        ...position,
      },
      {
        isUsingTool,
        ...position,
      },
    );
  }

  public useTool(durationMs: number = useToolDurationMs) {
    if (this.isUsingTool) {
      return false;
    }
    this.beginUsingTool(durationMs);
    this.sendToolUseState(true);
    return true;
  }

  public stopUsingToolAction() {
    if (!this.isUsingTool) {
      return;
    }
    this.stopUsingTool();
    this.sendToolUseState(false);
  }

  public syncToolUseState(isUsingTool: boolean) {
    if (isUsingTool && !this.isUsingTool) {
      this.beginUsingTool(Number.POSITIVE_INFINITY);
      return;
    }
    if (!isUsingTool && this.isUsingTool) {
      this.stopUsingTool();
    }
  }

  private beginUsingTool(durationMs: number) {
    this.isUsingTool = true;
    this.useToolTimeRemainingMs = durationMs;
    this.hspeed *= useToolSpeedMultiplier;
    this.vspeed *= this.isFlying ? useToolSpeedMultiplier : 1;
    if (this.currentVisual === "walk") {
      this.walkAnimation.pause();
    }
    this.currentVisual = "useTool";
    this.useToolAnimation.reset();
    this.graphics.use(this.useToolAnimation);
    this.useToolAnimation.play();
  }

  private stopUsingTool() {
    this.isUsingTool = false;
    this.useToolTimeRemainingMs = 0;
    if (this.currentVisual === "useTool") {
      this.currentVisual = "idle";
      this.graphics.use(this.idleSprite);
    }
  }

  private updateToolUseTimer(delta: number) {
    if (!this.isUsingTool) {
      return;
    }
    this.useToolTimeRemainingMs -= delta;
    if (this.useToolTimeRemainingMs > 0) {
      return;
    }
    this.stopUsingTool();
    this.sendToolUseState(false);
  }

  private currentPosition() {
    return {
      x: syncedPositionValue(this.pos.x),
      y: syncedPositionValue(this.pos.y),
    };
  }

  private currentMovementState() {
    const position = this.currentPosition();
    return {
      ...position,
      horizontalSpeed: this.hspeed,
      verticalSpeed: this.vspeed,
    };
  }

  private syncPosition() {
    const position = this.currentPosition();
    this.sendClient(messageTypes.updatePlayer, position, position);
  }

  private onMove() {
    if (
      this.keyLeft !== this.previousKeyLeft ||
      this.keyRight !== this.previousKeyRight ||
      this.keyJump !== this.previousKeyJump ||
      this.keyDown !== this.previousKeyDown ||
      this.keyUp !== this.previousKeyUp ||
      this.isFlying !== this.previousIsFlying
    ) {
      const shouldSyncPosition =
        this.isGrounded || this.isFlying || this.isFlying !== this.previousIsFlying;
      const movementState = shouldSyncPosition ? this.currentMovementState() : {};
      const payload = {
        keyLeft: this.keyLeft,
        keyRight: this.keyRight,
        keyJump: this.keyJump,
        keyDown: this.keyDown,
        keyUp: this.keyUp,
        isFlying: this.isFlying,
        ...movementState,
      };
      const statePatch = shouldSyncPosition
        ? payload
        : {
            keyDown: this.keyDown,
            keyUp: this.keyUp,
            isFlying: this.isFlying,
          };
      this.sendClient(messageTypes.updatePlayer, payload, statePatch);
      this.previousKeyLeft = this.keyLeft;
      this.previousKeyRight = this.keyRight;
      this.previousKeyJump = this.keyJump;
      this.previousKeyDown = this.keyDown;
      this.previousKeyUp = this.keyUp;
      this.previousIsFlying = this.isFlying;
    }
  }

  private updateControls(engine: ex.Engine) {
    if (!this.client) {
      return;
    }
    if (flyToggleKeys.some((key) => engine.input.keyboard.wasPressed(key as ex.Keys))) {
      this.isFlying = !this.isFlying;
      this.hspeed = 0;
      this.vspeed = 0;
    }
    this.keyLeft = engine.input.keyboard.isHeld(ex.Keys.A);
    this.keyRight = engine.input.keyboard.isHeld(ex.Keys.D);
    this.keyJump =
      engine.input.keyboard.isHeld(ex.Keys.Space) ||
      (this.isFlying && engine.input.keyboard.isHeld(ex.Keys.W));
    this.keyDown =
      engine.input.keyboard.isHeld(ex.Keys.S) ||
      engine.input.keyboard.isHeld(ex.Keys.ArrowDown);
    this.keyUp =
      !this.isFlying &&
      (engine.input.keyboard.isHeld(ex.Keys.W) ||
        engine.input.keyboard.isHeld(ex.Keys.ArrowUp));
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
    if (this.isUsingTool) {
      this.graphics.flipHorizontal = this.facingLeft;
      return;
    }
    const nextVisual: PlayerVisual = !this.isGrounded
      ? "jump"
      : this.keyDown && !this.isFlying
        ? "crouch"
        : this.keyUp
          ? "lookUp"
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
      if (nextVisual === "crouch") {
        this.graphics.use(this.crouchSprite);
      }
      if (nextVisual === "lookUp") {
        this.graphics.use(this.lookUpSprite);
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

  private flyVerticalInput() {
    return Number(this.keyDown) - Number(this.keyJump);
  }

  private moveWithFlying(dt: number, keySign: number) {
    const verticalSign = this.flyVerticalInput();
    const speedMultiplier = this.isUsingTool ? useToolSpeedMultiplier : 1;
    this.hspeed = approach(
      this.hspeed,
      keySign * flySpeed * speedMultiplier,
      flyAcceleration * 60 * dt,
    );
    this.vspeed = approach(
      this.vspeed,
      verticalSign * flySpeed * speedMultiplier,
      flyAcceleration * 60 * dt,
    );
    this.pos.x += this.hspeed * positionScale * dt;
    this.pos.y += this.vspeed * positionScale * dt;
    this.isGrounded = false;
  }

  private moveWithGravity(dt: number, keySign: number) {
    const targetHspeed =
      keySign *
      walkSpeed *
      (this.isRunning ? runSpeedMultiplier : 1) *
      (this.isUsingTool ? useToolSpeedMultiplier : 1);
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

    this.isGrounded = this.tileMeeting(this.pos.x, this.pos.y + 1);
  }

  override onPostUpdate(engine: ex.Engine, delta: number) {
    this.updateControls(engine);
    this.onMove();

    const dt = delta / 1000;

    const keySign = Number(this.keyRight) - Number(this.keyLeft);

    const previousGrounded = this.isGrounded;
    if (this.isFlying) {
      this.moveWithFlying(dt, keySign);
    }
    if (!this.isFlying) {
      this.moveWithGravity(dt, keySign);
    }

    if (!this.isFlying && this.isGrounded && this.keyJump) {
      this.onJump();
    }
    if (!this.isFlying && !previousGrounded && this.isGrounded) {
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
    this.updateToolUseTimer(delta);
  }
}
