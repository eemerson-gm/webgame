import * as ex from "excalibur";
import { Resources } from "../resource";
import { GameClient } from "../classes/GameClient";
import { messageTypes } from "../classes/GameProtocol";
import type { Data, PlayerTool } from "../classes/GameProtocol";
import { TILE_PX } from "../world/worldConfig";
import { PlayerInputState } from "./PlayerInputState";
import { MovingActor } from "./MovingActor";
import type { WorldBounds } from "./MovingActor";
import type { TileCollisionWorld } from "../simulation/entityPhysics";
import { SwordHitboxOutlineRaster } from "./SwordHitboxOutlineRaster";
import { DamageFlash } from "./DamageableActor";
import { SmashParticleActor } from "./SmashParticleActor";

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
const jumpSpeed = -2.8;
const jumpHoldDurationMs = 220;
const jumpHeldGravityMultiplier = 0.3;
const jumpReleasedGravityMultiplier = 1.15;
const jumpFallGravityMultiplier = 0.85;
const positionScale = 100;
const flySpeed = 2.4;
const flyAcceleration = 0.45;
const playerKnockbackHorizontalSpeed = 2.2;
const playerKnockbackVerticalSpeed = -1.4;
const playerKnockbackDurationMs = 240;
const playerKnockbackFriction = 0.94;
const playerMaxHealth = 6;
const playerDamageImmunityDurationMs = 500;
const playerDamageBlinkFrameMs = 90;
const positionPrecision = 1000;
const serverMovementSyncIntervalMs = 150;
const serverKnockbackMovementSyncIntervalMs = 50;
const serverMovementPositionThreshold = 0.5;
const serverMovementSpeedThreshold = 0.05;
const useToolFrameDurationMs = 75;
const useToolFrameCount = 5;
const useToolDurationMs = useToolFrameDurationMs * useToolFrameCount;
const swordFacingLockStartMs = useToolDurationMs / 3;
const useToolAnchor = ex.vec(0, 1);
const useToolMirroredAnchor = ex.vec(1, 1);
const useToolHiddenOffset = () => ex.vec(-100000, -100000);
const sleepBubbleOffset = ex.vec(TILE_PX / 2, -2);
const sleepBubbleAnchor = ex.vec(0.5, 1);
const testPlayerLabelText = "ABCD";
const testPlayerLabelOffset = ex.vec(TILE_PX / 2, -3);
const testPlayerLabelPixelSize = 1;
const testPlayerLabelGap = 1;
const testPlayerLabelOutlineSize = 1;
const testPlayerLabelGlyphs = {
  A: ["0110", "1001", "1111", "1001", "1001"],
  B: ["1110", "1001", "1110", "1001", "1110"],
  C: ["0111", "1000", "1000", "1000", "0111"],
  D: ["1110", "1001", "1001", "1001", "1110"],
} satisfies Record<string, string[]>;
const testPlayerLabelOutlineOffsets = [
  ex.vec(-1, -1),
  ex.vec(0, -1),
  ex.vec(1, -1),
  ex.vec(-1, 0),
  ex.vec(1, 0),
  ex.vec(-1, 1),
  ex.vec(0, 1),
  ex.vec(1, 1),
];
const testPlayerLabelGlyphWidth = testPlayerLabelGlyphs.A[0].length;
const testPlayerLabelGlyphHeight = testPlayerLabelGlyphs.A.length;
const testPlayerLabelWidth =
  testPlayerLabelText.length * testPlayerLabelGlyphWidth * testPlayerLabelPixelSize +
  (testPlayerLabelText.length - 1) * testPlayerLabelGap * testPlayerLabelPixelSize +
  testPlayerLabelOutlineSize * 2;
const testPlayerLabelHeight =
  testPlayerLabelGlyphHeight * testPlayerLabelPixelSize +
  testPlayerLabelOutlineSize * 2;
const swordHitboxWidth = TILE_PX * 0.75;
const swordHitboxHeight = TILE_PX * 0.875;
const swordHitboxInsetX = (TILE_PX - swordHitboxWidth) / 2;
const swordHitboxInsetY = (TILE_PX - swordHitboxHeight) / 2;
const swordHitboxOutlineScale = ex.vec(
  swordHitboxWidth / TILE_PX,
  swordHitboxHeight / TILE_PX,
);
const swordHitboxOffset = ex.vec(14, 14);
const swordHitboxOutlineToggleKeys = ["AltLeft", "AltRight", "Alt"];
const useToolFrames = [
  { offset: ex.vec(12, 8), rotation: -0.9 },
  { offset: ex.vec(14, 10), rotation: -0.45 },
  { offset: ex.vec(14, 12), rotation: 0.35 },
  { offset: ex.vec(14, 12), rotation: 0.75 },
  { offset: ex.vec(13, 12), rotation: 0.75 },
];
const playerToolByName: Record<string, PlayerTool> = {
  pickaxe: "pickaxe",
  sword: "sword",
};
type PlayerVisual = "idle" | "walk" | "jump" | "crouch" | "useTool";

const syncedPositionValue = (value: number) =>
  Math.round(value * positionPrecision) / positionPrecision;

const useToolFrameIndexAt = (elapsedMs: number) =>
  Math.floor((elapsedMs % useToolDurationMs) / useToolFrameDurationMs) %
  useToolFrameCount;

const playerToolFrom = (value: unknown): PlayerTool =>
  playerToolByName[String(value)] ?? "pickaxe";

class TestPlayerLabelRaster extends ex.Raster {
  constructor() {
    super({
      width: testPlayerLabelWidth,
      height: testPlayerLabelHeight,
      origin: ex.vec(Math.floor(testPlayerLabelWidth / 2), testPlayerLabelHeight),
      smoothing: false,
      filtering: ex.ImageFiltering.Pixel,
    });
  }

  override clone() {
    return new TestPlayerLabelRaster();
  }

  override execute(ctx: CanvasRenderingContext2D) {
    const textOffset = ex.vec(
      testPlayerLabelOutlineSize,
      testPlayerLabelOutlineSize,
    );
    testPlayerLabelOutlineOffsets.forEach((offset) => {
      this.drawText(ctx, textOffset.add(offset), "#000000");
    });
    this.drawText(ctx, textOffset, "#ffffff");
  }

  private drawText(
    ctx: CanvasRenderingContext2D,
    offset: ex.Vector,
    color: string,
  ) {
    ctx.fillStyle = color;
    testPlayerLabelText.split("").forEach((character, characterIndex) => {
      const glyph = testPlayerLabelGlyphs[character];
      const characterX =
        characterIndex *
        (testPlayerLabelGlyphWidth + testPlayerLabelGap) *
        testPlayerLabelPixelSize;
      glyph.forEach((row, rowIndex) => {
        row.split("").forEach((pixel, columnIndex) => {
          if (pixel !== "1") {
            return;
          }
          ctx.fillRect(
            characterX + columnIndex * testPlayerLabelPixelSize + offset.x,
            rowIndex * testPlayerLabelPixelSize + offset.y,
            testPlayerLabelPixelSize,
            testPlayerLabelPixelSize,
          );
        });
      });
    });
  }
}

export class Player extends MovingActor {
  private client?: GameClient;
  isLocal: boolean;
  isFlying: boolean = false;
  isUsingTool: boolean = false;
  isPaused: boolean = false;
  public health: number = playerMaxHealth;
  public readonly maxHealth: number = playerMaxHealth;
  private readonly inputState: PlayerInputState = new PlayerInputState();
  private readonly spawnPosition: ex.Vector;
  private idleSprite: ex.Sprite;
  private jumpSprite: ex.Sprite;
  private crouchSprite: ex.Sprite;
  private toolSprites: Record<PlayerTool, ex.Sprite>;
  private toolActor: ex.Actor;
  private swordHitboxActor: ex.Actor;
  private sleepBubbleActor: ex.Actor;
  private testLabelActor?: ex.Actor;
  private damageFlash: DamageFlash;
  private walkAnimation: ex.Animation;
  private useToolAnimation: ex.Animation;
  private currentVisual: PlayerVisual = "idle";
  private activeTool: PlayerTool = "pickaxe";
  private isSwordHitboxOutlineEnabled: boolean = false;
  private useToolTimeRemainingMs: number = 0;
  private useToolElapsedMs: number = 0;
  private knockbackTimeRemainingMs: number = 0;
  private damageImmunityTimeRemainingMs: number = 0;
  private jumpHoldTimeRemainingMs: number = 0;
  private serverMovementSyncElapsedMs: number = 0;
  private lastServerMovementState?: Data;

  constructor(
    pos: ex.Vector,
    tilemap: ex.TileMap,
    client?: GameClient,
    collisionWorld?: TileCollisionWorld,
  ) {
    const width = TILE_PX;
    const height = TILE_PX;
    super(
      pos,
      tilemap,
      ex.vec(width, height),
      {
        offsetX: collisionOffsetX,
        offsetY: collisionOffsetY,
        width: collisionWidth,
        height: collisionHeight,
        edgeInset: collisionEdgeInset,
      },
      collisionWorld,
    );
    this.client = client;
    this.spawnPosition = ex.vec(pos.x, pos.y);
    this.idleSprite = Resources.Player.toSprite();
    this.jumpSprite = Resources.PlayerJump.toSprite();
    this.crouchSprite = Resources.PlayerCrouch.toSprite();
    this.toolSprites = {
      pickaxe: Resources.BronzePickaxe.toSprite(),
      sword: Resources.BronzeSword.toSprite(),
    };
    this.toolActor = new ex.Actor({
      pos: useToolHiddenOffset(),
      anchor: ex.vec(0, 0),
      width: TILE_PX,
      height: TILE_PX,
      z: -1,
    });
    this.toolActor.graphics.anchor = useToolAnchor;
    this.toolActor.graphics.use(this.toolSprites[this.activeTool]);
    this.toolActor.graphics.visible = false;
    this.toolActor.graphics.opacity = 0;
    this.swordHitboxActor = new ex.Actor({
      pos: useToolHiddenOffset(),
      anchor: ex.vec(0, 0),
      width: TILE_PX,
      height: TILE_PX,
      z: 10,
    });
    this.swordHitboxActor.graphics.use(new SwordHitboxOutlineRaster());
    this.swordHitboxActor.graphics.visible = false;
    this.swordHitboxActor.graphics.opacity = 0;
    this.sleepBubbleActor = new ex.Actor({
      pos: sleepBubbleOffset,
      anchor: sleepBubbleAnchor,
      width: TILE_PX,
      height: TILE_PX,
      z: 11,
    });
    this.sleepBubbleActor.graphics.anchor = sleepBubbleAnchor;
    this.sleepBubbleActor.graphics.use(Resources.ThoughtBubbleSleep.toSprite());
    this.sleepBubbleActor.graphics.visible = false;
    this.sleepBubbleActor.graphics.opacity = 0;
    this.testLabelActor = client
      ? new ex.Actor({
          pos: testPlayerLabelOffset,
          anchor: ex.vec(0, 0),
          width: testPlayerLabelWidth,
          height: testPlayerLabelHeight,
          z: 12,
        })
      : undefined;
    this.testLabelActor?.graphics.use(new TestPlayerLabelRaster());
    this.damageFlash = new DamageFlash(this, {
      durationMs: playerDamageImmunityDurationMs,
      blinkFrameMs: playerDamageBlinkFrameMs,
    });
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

  get keyLeft() {
    return this.inputState.keyLeft;
  }

  set keyLeft(value: boolean) {
    this.inputState.keyLeft = value;
  }

  get keyRight() {
    return this.inputState.keyRight;
  }

  set keyRight(value: boolean) {
    this.inputState.keyRight = value;
  }

  get keyJump() {
    return this.inputState.keyJump;
  }

  set keyJump(value: boolean) {
    this.inputState.keyJump = value;
  }

  get keyDown() {
    return this.inputState.keyDown;
  }

  set keyDown(value: boolean) {
    this.inputState.keyDown = value;
  }

  override onInitialize(engine: ex.Engine) {
    this.walkAnimation.pause();
    this.graphics.use(this.idleSprite);
    this.addChild(this.toolActor);
    this.addChild(this.swordHitboxActor);
    this.addChild(this.sleepBubbleActor);
    if (this.testLabelActor) {
      this.addChild(this.testLabelActor);
    }
    this.damageFlash.initialize(engine);
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
    if (!this.jump(jumpSpeed)) {
      return;
    }
    this.jumpHoldTimeRemainingMs = jumpHoldDurationMs;
    this.sendClient(messageTypes.updatePlayer, {
      keyJump: true,
    });
  }

  private onLand() {
    this.jumpHoldTimeRemainingMs = 0;
    this.syncPosition();
  }

  private setActiveTool(tool: PlayerTool) {
    this.activeTool = tool;
    this.toolActor.graphics.use(this.toolSprites[tool]);
  }

  private sendToolUseState(isUsingTool: boolean, activeTool = this.activeTool) {
    const position = this.currentPosition();
    this.sendClient(messageTypes.updatePlayer, {
      isUsingTool,
      activeTool,
      ...position,
    });
  }

  public useTool(
    durationMs: number = useToolDurationMs,
    tool: PlayerTool = "pickaxe",
  ) {
    if (this.isPaused) {
      return false;
    }
    if (this.isUsingTool) {
      return false;
    }
    this.beginUsingTool(durationMs, tool);
    this.sendToolUseState(true, tool);
    return true;
  }

  public useSword(durationMs: number = useToolDurationMs) {
    return this.useTool(durationMs, "sword");
  }

  public knockBackFrom(actor: ex.Actor) {
    if (this.isPaused) {
      return;
    }
    if (this.isFlying) {
      return;
    }
    const actorCenterX = actor.pos.x + actor.width / 2;
    const direction = this.centerX() < actorCenterX ? -1 : 1;
    this.isFlying = false;
    this.hspeed = playerKnockbackHorizontalSpeed * direction;
    this.vspeed = playerKnockbackVerticalSpeed;
    this.knockbackTimeRemainingMs = playerKnockbackDurationMs;
    this.jumpHoldTimeRemainingMs = 0;
    const movementState = {
      ...this.currentMovementState(),
      isFlying: this.isFlying,
    };
    this.sendClient(messageTypes.updatePlayer, movementState);
  }

  public takeDamageFrom(
    actor: ex.Actor,
    damage: number = 1,
    damageFeedback: "full" | "flash" = "full",
  ) {
    if (!this.canTakeDamage()) {
      return false;
    }
    this.health = Math.max(this.health - damage, 0);
    this.damageImmunityTimeRemainingMs = playerDamageImmunityDurationMs;
    this.showDamageFeedback(this.damageParticlePosition(), damageFeedback);
    if (this.health <= 0) {
      this.respawnAtJoinPosition();
      return true;
    }
    this.knockBackFrom(actor);
    this.syncHealthState();
    return true;
  }

  public isAlive() {
    return this.health > 0;
  }

  public syncHealth(health: unknown) {
    const nextHealth = Number(health);
    if (!Number.isFinite(nextHealth)) {
      return;
    }
    const previousHealth = this.health;
    this.health = Math.max(0, Math.min(nextHealth, this.maxHealth));
    if (this.health < previousHealth) {
      this.damageFlash.start();
    }
  }

  private damageParticlePosition() {
    return ex.vec(this.pos.x + this.width / 2, this.pos.y + this.height / 2);
  }

  private showDamageFeedback(
    position: ex.Vector,
    damageFeedback: "full" | "flash" = "full",
  ) {
    this.damageFlash.start();
    if (damageFeedback === "flash") {
      return;
    }
    this.scene?.add(new SmashParticleActor(position));
  }

  private canTakeDamage() {
    if (this.isPaused) {
      return false;
    }
    if (this.isFlying) {
      return false;
    }
    if (this.damageImmunityTimeRemainingMs > 0) {
      return false;
    }
    return this.health > 0;
  }

  private respawnAtJoinPosition() {
    this.health = this.maxHealth;
    this.pos = ex.vec(this.spawnPosition.x, this.spawnPosition.y);
    this.hspeed = 0;
    this.vspeed = 0;
    this.isFlying = false;
    this.knockbackTimeRemainingMs = 0;
    this.jumpHoldTimeRemainingMs = 0;
    this.syncHealthState();
  }

  public swordHitBounds(): WorldBounds | null {
    if (this.isPaused) {
      return null;
    }
    if (!this.isUsingTool || this.activeTool !== "sword") {
      return null;
    }
    const offset = this.currentSwordHitboxOffset();
    const left = this.facingLeft
      ? this.pos.x + offset.x - TILE_PX
      : this.pos.x + offset.x;
    const top = this.pos.y + offset.y - TILE_PX;
    const insetLeft = left + swordHitboxInsetX;
    const insetTop = top + swordHitboxInsetY;
    return {
      left: insetLeft,
      right: insetLeft + swordHitboxWidth,
      top: insetTop,
      bottom: insetTop + swordHitboxHeight,
    };
  }

  public keepUsingTool(durationMs: number, tool: PlayerTool = "pickaxe") {
    if (this.isPaused) {
      return false;
    }
    if (!this.isUsingTool) {
      return this.useTool(durationMs, tool);
    }
    const didChangeTool = this.activeTool !== tool;
    this.setActiveTool(tool);
    this.useToolTimeRemainingMs = Math.max(
      this.useToolTimeRemainingMs,
      durationMs,
    );
    if (didChangeTool) {
      this.sendToolUseState(true, tool);
    }
    return true;
  }

  public stopUsingToolAction() {
    if (!this.isUsingTool) {
      return;
    }
    this.stopUsingTool();
    this.sendToolUseState(false);
  }

  public syncPauseState(isPaused: boolean) {
    const position = this.currentPosition();
    this.setPaused(isPaused);
    this.sendClient(messageTypes.updatePlayer, {
      isPaused,
      keyLeft: false,
      keyRight: false,
      keyJump: false,
      keyDown: false,
      isUsingTool: false,
      horizontalSpeed: 0,
      verticalSpeed: 0,
      ...position,
    });
  }

  public setPaused(isPaused: boolean) {
    this.isPaused = isPaused;
    this.sleepBubbleActor.graphics.visible = isPaused;
    this.sleepBubbleActor.graphics.opacity = isPaused ? 1 : 0;
    if (!isPaused) {
      return;
    }
    this.keyLeft = false;
    this.keyRight = false;
    this.keyJump = false;
    this.keyDown = false;
    this.hspeed = 0;
    this.vspeed = 0;
    this.knockbackTimeRemainingMs = 0;
    this.jumpHoldTimeRemainingMs = 0;
    this.stopUsingTool();
    this.walkAnimation.pause();
    this.currentVisual = "idle";
    this.graphics.use(this.idleSprite);
  }

  public syncToolUseState(
    isUsingTool: boolean,
    durationMs: number = useToolDurationMs,
    tool: unknown = "pickaxe",
  ) {
    const activeTool = playerToolFrom(tool);
    if (isUsingTool && !this.isUsingTool) {
      this.beginUsingTool(durationMs, activeTool);
      return;
    }
    if (isUsingTool && this.isUsingTool) {
      this.setActiveTool(activeTool);
      this.useToolTimeRemainingMs = Math.max(
        this.useToolTimeRemainingMs,
        durationMs,
      );
      return;
    }
    if (!isUsingTool && this.isUsingTool) {
      this.stopUsingTool();
    }
  }

  private beginUsingTool(durationMs: number, tool: PlayerTool) {
    this.isUsingTool = true;
    this.setActiveTool(tool);
    this.useToolTimeRemainingMs = durationMs;
    this.useToolElapsedMs = 0;
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
    this.toolActor.pos = useToolHiddenOffset();
    this.toolActor.graphics.visible = false;
    this.toolActor.graphics.opacity = 0;
    this.swordHitboxActor.pos = useToolHiddenOffset();
    this.swordHitboxActor.graphics.visible = false;
    this.swordHitboxActor.graphics.opacity = 0;
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

  private currentToolFrame() {
    return useToolFrames[useToolFrameIndexAt(this.useToolElapsedMs)];
  }

  private currentToolOffset() {
    const frame = this.currentToolFrame();
    if (this.facingLeft) {
      return ex.vec(TILE_PX - frame.offset.x, frame.offset.y);
    }
    return ex.vec(frame.offset.x, frame.offset.y);
  }

  private currentToolRotation() {
    const frame = this.currentToolFrame();
    return this.facingLeft ? -frame.rotation : frame.rotation;
  }

  private currentSwordHitboxOffset() {
    if (this.facingLeft) {
      return ex.vec(TILE_PX - swordHitboxOffset.x, swordHitboxOffset.y);
    }
    return swordHitboxOffset;
  }

  private syncSwordHitboxOutline() {
    const swordHitBounds = this.swordHitBounds();
    if (!this.isSwordHitboxOutlineEnabled || !swordHitBounds) {
      this.swordHitboxActor.pos = useToolHiddenOffset();
      this.swordHitboxActor.graphics.visible = false;
      this.swordHitboxActor.graphics.opacity = 0;
      return;
    }
    this.swordHitboxActor.pos = ex.vec(
      swordHitBounds.left - this.pos.x,
      swordHitBounds.top - this.pos.y,
    );
    this.swordHitboxActor.scale = swordHitboxOutlineScale;
    this.swordHitboxActor.graphics.opacity = 1;
    this.swordHitboxActor.graphics.visible = true;
  }

  private syncToolOverlay() {
    if (!this.isUsingTool) {
      this.toolActor.pos = useToolHiddenOffset();
      this.toolActor.graphics.visible = false;
      this.toolActor.graphics.opacity = 0;
      this.syncSwordHitboxOutline();
      return;
    }
    this.toolActor.pos = this.currentToolOffset();
    this.toolActor.rotation = this.currentToolRotation();
    this.toolActor.graphics.anchor = this.facingLeft
      ? useToolMirroredAnchor
      : useToolAnchor;
    this.toolActor.graphics.flipHorizontal = this.facingLeft;
    this.toolActor.graphics.opacity = 1;
    this.toolActor.graphics.visible = true;
    this.syncSwordHitboxOutline();
  }

  private updateToolOverlay(delta: number) {
    if (!this.isUsingTool) {
      this.syncToolOverlay();
      return;
    }
    this.useToolElapsedMs += delta;
    this.syncToolOverlay();
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
    this.sendClient(messageTypes.updatePlayer, position);
  }

  private syncHealthState() {
    const movementState = {
      ...this.currentMovementState(),
      health: this.health,
      isFlying: this.isFlying,
    };
    this.sendClient(messageTypes.updatePlayer, movementState, movementState);
  }

  private syncMovementPeriodically(delta: number, shouldBroadcastMovement = false) {
    if (!this.client) {
      return;
    }
    this.serverMovementSyncElapsedMs += delta;
    const syncIntervalMs = shouldBroadcastMovement
      ? serverKnockbackMovementSyncIntervalMs
      : serverMovementSyncIntervalMs;
    if (this.serverMovementSyncElapsedMs < syncIntervalMs) {
      return;
    }
    this.serverMovementSyncElapsedMs =
      this.serverMovementSyncElapsedMs % syncIntervalMs;
    const movementState = {
      ...this.currentMovementState(),
      isFlying: this.isFlying,
    };
    if (!this.shouldSyncMovementState(movementState)) {
      return;
    }
    this.lastServerMovementState = movementState;
    const payload = shouldBroadcastMovement ? movementState : {};
    const statePatch = shouldBroadcastMovement ? undefined : movementState;
    this.sendClient(messageTypes.updatePlayer, payload, statePatch);
  }

  private shouldSyncMovementState(movementState: Data) {
    const lastMovementState = this.lastServerMovementState;
    if (!lastMovementState) {
      return true;
    }
    if (
      Math.abs(Number(movementState.x) - Number(lastMovementState.x)) >=
      serverMovementPositionThreshold
    ) {
      return true;
    }
    if (
      Math.abs(Number(movementState.y) - Number(lastMovementState.y)) >=
      serverMovementPositionThreshold
    ) {
      return true;
    }
    if (
      Math.abs(
        Number(movementState.horizontalSpeed) -
          Number(lastMovementState.horizontalSpeed),
      ) >= serverMovementSpeedThreshold
    ) {
      return true;
    }
    if (
      Math.abs(
        Number(movementState.verticalSpeed) -
          Number(lastMovementState.verticalSpeed),
      ) >= serverMovementSpeedThreshold
    ) {
      return true;
    }
    return movementState.isFlying !== lastMovementState.isFlying;
  }

  private onMove() {
    if (!this.inputState.hasChanged(this.isFlying)) {
      return;
    }
    const shouldSyncPosition = this.inputState.shouldSyncPosition(
      this.isGrounded,
      this.isFlying,
    );
    const movementState = shouldSyncPosition ? this.currentMovementState() : {};
    const payload = this.inputState.payload(this.isFlying, movementState);
    const statePatch = this.inputState.statePatch(
      this.isFlying,
      shouldSyncPosition,
      payload,
    );
    this.sendClient(
      messageTypes.updatePlayer,
      payload,
      statePatch === payload ? undefined : statePatch,
    );
    this.inputState.remember(this.isFlying);
  }

  private updateControls(engine: ex.Engine) {
    if (!this.client) {
      return;
    }
    if (this.isPaused) {
      return;
    }
    if (this.didToggleSwordHitboxOutline(engine)) {
      this.isSwordHitboxOutlineEnabled = !this.isSwordHitboxOutlineEnabled;
    }
    const controlState = this.inputState.readKeyboard(engine, this.isFlying);
    this.isFlying = controlState.isFlying;
    if (controlState.didToggleFlying) {
      this.hspeed = 0;
      this.vspeed = 0;
    }
  }

  private didToggleSwordHitboxOutline(engine: ex.Engine) {
    return swordHitboxOutlineToggleKeys.some((key) =>
      engine.input.keyboard.wasPressed(key as ex.Keys),
    );
  }

  private canTurnFromInput() {
    if (!this.isUsingTool) {
      return true;
    }
    if (this.activeTool !== "sword") {
      return true;
    }
    return this.useToolElapsedMs < swordFacingLockStartMs;
  }

  private syncPlayerVisuals(keySign: number) {
    if (this.canTurnFromInput()) {
      this.syncFacingFromHorizontalSign(keySign);
    }
    if (this.isUsingTool) {
      this.graphics.flipHorizontal = this.facingLeft;
      return;
    }
    const nextVisual: PlayerVisual = !this.isGrounded
      ? "jump"
      : this.keyDown && !this.isFlying
        ? "crouch"
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
    }
    this.graphics.flipHorizontal = this.facingLeft;
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
    return this.inputState.flyingVerticalSign();
  }

  private moveWithFlying(dt: number, keySign: number) {
    const verticalSign = this.flyVerticalInput();
    this.hspeed = approach(
      this.hspeed,
      keySign * flySpeed,
      flyAcceleration * 60 * dt,
    );
    this.vspeed = approach(
      this.vspeed,
      verticalSign * flySpeed,
      flyAcceleration * 60 * dt,
    );
    this.moveFreely(positionScale, dt);
  }

  private moveWithGravity(delta: number, dt: number, keySign: number) {
    const targetHspeed =
      keySign *
      walkSpeed *
      (this.isRunning ? runSpeedMultiplier : 1);
    const horizontalAcceleration = this.horizontalAccelerationFor(keySign);

    this.hspeed = approach(
      this.hspeed,
      targetHspeed,
      horizontalAcceleration * 60 * dt,
    );
    this.applyGravity(this.currentJumpGravity(delta), dt);

    this.moveWithVelocity(positionScale, dt);
  }

  private currentJumpGravity(delta: number) {
    if (!this.isJumping) {
      this.jumpHoldTimeRemainingMs = 0;
      return gravity;
    }
    if (this.shouldHoldJump()) {
      this.jumpHoldTimeRemainingMs = Math.max(
        this.jumpHoldTimeRemainingMs - delta,
        0,
      );
      return gravity * jumpHeldGravityMultiplier;
    }
    this.jumpHoldTimeRemainingMs = 0;
    if (this.vspeed < 0) {
      return gravity * jumpReleasedGravityMultiplier;
    }
    return gravity * jumpFallGravityMultiplier;
  }

  private shouldHoldJump() {
    if (!this.keyJump) {
      return false;
    }
    if (!this.isJumping) {
      return false;
    }
    if (this.vspeed >= 0) {
      return false;
    }
    return this.jumpHoldTimeRemainingMs > 0;
  }

  private moveWithKnockback(delta: number, dt: number) {
    this.knockbackTimeRemainingMs = Math.max(
      this.knockbackTimeRemainingMs - delta,
      0,
    );
    this.applyGravity(gravity, dt);
    this.moveWithVelocity(positionScale, dt);
    this.hspeed *= playerKnockbackFriction;
  }

  private updateDamageFeedback(delta: number) {
    this.damageImmunityTimeRemainingMs = Math.max(
      this.damageImmunityTimeRemainingMs - delta,
      0,
    );
    this.damageFlash.tick(delta);
  }

  override onPostUpdate(engine: ex.Engine, delta: number) {
    this.updateDamageFeedback(delta);
    if (this.isPaused) {
      this.updateToolOverlay(delta);
      return;
    }
    this.updateControls(engine);

    const dt = delta / 1000;

    const keySign = this.inputState.horizontalSign();

    const previousGrounded = this.isGrounded;
    const isKnockbackActive = this.knockbackTimeRemainingMs > 0;
    if (isKnockbackActive) {
      this.moveWithKnockback(delta, dt);
    }
    if (!isKnockbackActive && this.isFlying) {
      this.moveWithFlying(dt, keySign);
    }
    if (!isKnockbackActive && !this.isFlying) {
      this.moveWithGravity(delta, dt, keySign);
    }

    if (!isKnockbackActive && !this.isFlying && this.isGrounded && this.keyJump) {
      this.onJump();
    }
    if (!this.isFlying && !previousGrounded && this.isGrounded) {
      this.onLand();
    }

    this.syncPlayerVisuals(keySign);
    this.onMove();
    this.syncMovementPeriodically(delta, isKnockbackActive);
    this.updateToolOverlay(delta);
    this.updateToolUseTimer(delta);
  }
}
