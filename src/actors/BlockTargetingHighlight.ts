import * as ex from "excalibur";
import type { GameClient } from "../classes/GameClient";
import { messageTypes } from "../classes/GameProtocol";
import type { TerrainBlockBreakUpdate } from "../classes/GameProtocol";
import type { PlayerPowerup } from "../classes/Powerups";
import type { TerrainTileMap } from "../classes/TerrainTileMap";
import { toolbarSelection } from "../classes/ToolbarSelection";
import { Resources } from "../resource";
import { TILE_PX } from "../world/worldConfig";
import { BlockBreakParticleEmitter } from "./BlockBreakParticleEmitter";
import type {
  BlockBreakParticleState,
  TargetBlockPosition,
} from "./BlockBreakParticleEmitter";
import { BlockHighlightRaster } from "./BlockHighlightRaster";
import type { Player } from "./Player";

const blockTargetRange = 3;
const blockBreakFrameDurationMs = 90;
const blockBreakFrameCount = 4;
const blockHighlightGradientDurationMs = 2200;
const blockBreakAnimationZ = 9;
const blockHighlightZ = 10;
const blockBreakHitboxZ = 15;
const blockBreakHitboxColor = ex.Color.fromHex("#ff3333");
const blockBreakHitboxOpacity = 0.35;
const blockBreakRegenDelayMs = 1000;
const blockHighlightGradient = [
  [255, 214, 36],
  [255, 255, 255],
  [255, 242, 122],
  [255, 255, 255],
];
const blockBreakFrameResources = [
  Resources.BlockBreak1,
  Resources.BlockBreak2,
  Resources.BlockBreak3,
  Resources.BlockBreak4,
];
const hiddenActorPosition = () => ex.vec(-100000, -100000);

type RemotePlayerEntry = {
  id: string;
  player: Player;
};
type RemoteBreakAnimationEntry = {
  target: TargetBlockPosition;
  actor: ex.Actor;
  particleState: BlockBreakParticleState | null;
  health: number;
};

type BlockBreakVisualEntry = {
  target: TargetBlockPosition;
  actor: ex.Actor;
  particleState: BlockBreakParticleState | null;
};

type BreakingTargetEntry = {
  target: TargetBlockPosition;
  powerup: PlayerPowerup;
  health: number;
  maxHealth: number;
  regenPerSecond: number;
  regenDelayRemainingMs: number;
  actor: ex.Actor;
  particleState: BlockBreakParticleState | null;
  isTouched: boolean;
};

type WorldBounds = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

type LocalPlayerProvider = () => Player | null;
type RemotePlayerProvider = (playerId: string) => Player | null;
type RemotePlayersProvider = () => RemotePlayerEntry[];
type PowerupUseHandler = (powerup: PlayerPowerup) => void;
const colorChannelBetween = (start: number, end: number, progress: number) =>
  Math.round(start + (end - start) * progress);

const hexChannel = (channel: number) => channel.toString(16).padStart(2, "0");

const blockHighlightColorAt = (elapsedMs: number) => {
  const position =
    ((elapsedMs % blockHighlightGradientDurationMs) /
      blockHighlightGradientDurationMs) *
    blockHighlightGradient.length;
  const shadeIndex = Math.floor(position);
  const nextShadeIndex = (shadeIndex + 1) % blockHighlightGradient.length;
  const shadeProgress = position - shadeIndex;
  const shade = blockHighlightGradient[shadeIndex];
  const nextShade = blockHighlightGradient[nextShadeIndex];
  const channels = shade.map((channel, index) =>
    colorChannelBetween(channel, nextShade[index], shadeProgress),
  );

  return `#${channels.map(hexChannel).join("")}`;
};

class AlphaMaskedBlockBreakRaster extends ex.Raster {
  private readonly frame: ex.ImageSource;

  constructor(frame: ex.ImageSource) {
    super({
      width: TILE_PX,
      height: TILE_PX,
      origin: ex.vec(0, 0),
      smoothing: false,
      filtering: ex.ImageFiltering.Pixel,
    });
    this.frame = frame;
  }

  override clone() {
    return new AlphaMaskedBlockBreakRaster(this.frame);
  }

  override execute(ctx: CanvasRenderingContext2D) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.frame.image, 0, 0);
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(Resources.MinerPowerup.image, 0, 0);
    ctx.globalCompositeOperation = "source-over";
  }
}

export class BlockTargetingHighlight extends ex.Actor {
  private readonly terrain: TerrainTileMap;
  private readonly client: GameClient;
  private readonly getLocalPlayer: LocalPlayerProvider;
  private readonly getRemotePlayer: RemotePlayerProvider;
  private readonly getRemotePlayers: RemotePlayersProvider;
  private readonly onUsePowerup: PowerupUseHandler;
  private readonly highlightGraphic: BlockHighlightRaster;
  private readonly remoteBreakAnimationsByPlayerId: Record<
    string,
    Record<string, RemoteBreakAnimationEntry>
  >;
  private readonly breakingTargetsByKey: Record<string, BreakingTargetEntry>;
  private readonly hitboxActors: ex.Actor[];
  private readonly breakParticleEmitter: BlockBreakParticleEmitter;
  private engine?: ex.Engine;
  private highlightElapsedMs: number = 0;
  private isPointerHeld: boolean = false;
  private isPlacePointerHeld: boolean = false;
  private lastPlacedTargetKey: string | null = null;
  private lastAppliedBlockBreakFrameIndex: number | null = null;

  constructor(
    terrain: TerrainTileMap,
    client: GameClient,
    getLocalPlayer: LocalPlayerProvider,
    getRemotePlayer: RemotePlayerProvider,
    getRemotePlayers: RemotePlayersProvider,
    onUsePowerup: PowerupUseHandler,
  ) {
    super({
      pos: ex.vec(-TILE_PX, -TILE_PX),
      anchor: ex.vec(0, 0),
      width: TILE_PX,
      height: TILE_PX,
      z: blockHighlightZ,
    });
    this.terrain = terrain;
    this.client = client;
    this.getLocalPlayer = getLocalPlayer;
    this.getRemotePlayer = getRemotePlayer;
    this.getRemotePlayers = getRemotePlayers;
    this.onUsePowerup = onUsePowerup;
    this.breakParticleEmitter = new BlockBreakParticleEmitter(terrain);
    this.highlightGraphic = new BlockHighlightRaster(blockHighlightColorAt(0));
    this.graphics.anchor = ex.vec(0, 0);
    this.graphics.use(this.highlightGraphic);
    this.graphics.visible = false;
    this.graphics.opacity = 0;
    this.remoteBreakAnimationsByPlayerId = {};
    this.breakingTargetsByKey = {};
    this.hitboxActors = [];
  }

  override onInitialize(engine: ex.Engine) {
    this.engine = engine;
    this.breakParticleEmitter.initialize(engine);
    engine.canvas.addEventListener("contextmenu", (event) => {
      event.preventDefault();
    });
    engine.input.pointers.primary.on("down", (event) => {
      if (event.button !== ex.PointerButton.Left) {
        return;
      }
      this.isPointerHeld = true;
      this.startToolUse();
    });
    engine.input.pointers.primary.on("down", (event) => {
      if (event.button !== ex.PointerButton.Right) {
        return;
      }
      if (this.useSelectedPowerupItem()) {
        return;
      }
      this.isPlacePointerHeld = true;
      this.placeBlockAt(this.placeTargetAt(event.worldPos));
    });
    engine.input.pointers.primary.on("up", (event) => {
      if (event.button !== ex.PointerButton.Left) {
        return;
      }
      this.isPointerHeld = false;
      this.stopToolUse();
    });
    engine.input.pointers.primary.on("up", (event) => {
      if (event.button !== ex.PointerButton.Right) {
        return;
      }
      this.isPlacePointerHeld = false;
      this.lastPlacedTargetKey = null;
    });
    engine.input.pointers.primary.on("cancel", () => {
      this.isPointerHeld = false;
      this.isPlacePointerHeld = false;
      this.lastPlacedTargetKey = null;
      this.stopToolUse();
    });
  }

  override onPostUpdate(engine: ex.Engine, delta: number) {
    const mouseWorldPos = this.currentMouseWorldPosition(engine);
    const target = this.targetAt(mouseWorldPos);
    const placeTarget = this.placeTargetAt(mouseWorldPos);
    const highlightTarget = this.highlightTargetFor(placeTarget);
    this.moveToTarget(highlightTarget);
    this.syncHighlightVisibility(highlightTarget);
    this.updateHighlightColor(delta);
    this.updatePlacingTarget(placeTarget);
    this.updateBreakingTargets(delta);
  }

  public applyRemoteBreakUpdate(update: TerrainBlockBreakUpdate) {
    if (!update.id) {
      return;
    }
    const remotePlayer = this.getRemotePlayer(update.id);
    if (remotePlayer?.isPaused) {
      this.hideRemoteBreakAnimationsForPlayer(update.id);
      return;
    }
    if (!update.isBreaking) {
      this.hideRemoteBreakAnimation(update.id, {
        column: update.column,
        row: update.row,
      });
      return;
    }
    const target = {
      column: update.column,
      row: update.row,
    };
    this.showRemoteBreakAnimation(
      update.id,
      target,
      update.health ?? 0,
      update.maxHealth ?? this.blockMaxHealthFor(target),
      update.isDamaging === true,
    );
  }

  public removeRemoteBreakAnimation(playerId: string) {
    this.hideRemoteBreakAnimationsForPlayer(playerId);
  }

  private currentMouseWorldPosition(engine: ex.Engine) {
    const mouseScreenPos = engine.input.pointers.primary.lastScreenPos;
    if (!mouseScreenPos) {
      return null;
    }
    return engine.screenToWorldCoordinates(mouseScreenPos);
  }

  private targetAt(mouseWorldPos: ex.Vector | null) {
    const localPlayer = this.getLocalPlayer();
    if (!mouseWorldPos || !localPlayer) {
      return null;
    }
    if (localPlayer.isPaused) {
      return null;
    }
    const target = this.tilePositionAt(mouseWorldPos);
    if (!this.isSolidTile(target)) {
      return null;
    }
    if (!localPlayer.isFlying && !this.isWithinPlayerRange(localPlayer, target)) {
      return null;
    }
    return target;
  }

  private placeTargetAt(mouseWorldPos: ex.Vector | null) {
    const localPlayer = this.getLocalPlayer();
    if (!mouseWorldPos || !localPlayer) {
      return null;
    }
    if (localPlayer.isPaused) {
      return null;
    }
    if (!toolbarSelection.selectedBlockKind()) {
      return null;
    }
    const target = this.tilePositionAt(mouseWorldPos);
    if (!this.terrain.isInside(target.column, target.row)) {
      return null;
    }
    if (this.terrain.tileKindAt(target.column, target.row)) {
      return null;
    }
    if (this.terrain.isProtectedAt(target.column, target.row)) {
      return null;
    }
    if (!localPlayer.isFlying && !this.isWithinPlayerRange(localPlayer, target)) {
      return null;
    }
    if (!localPlayer.isFlying && !this.isNextToSolidTile(target)) {
      return null;
    }
    if (this.isBlockedByPlayer(target, localPlayer)) {
      return null;
    }
    return target;
  }

  private tilePositionAt(worldPos: ex.Vector) {
    return {
      column: Math.floor(
        (worldPos.x - this.terrain.map.pos.x) / this.terrain.map.tileWidth,
      ),
      row: Math.floor(
        (worldPos.y - this.terrain.map.pos.y) / this.terrain.map.tileHeight,
      ),
    };
  }

  private isSolidTile(target: TargetBlockPosition) {
    return this.terrain.isSolidAt(target.column, target.row);
  }

  private isNextToSolidTile(target: TargetBlockPosition) {
    return [
      { column: target.column - 1, row: target.row },
      { column: target.column + 1, row: target.row },
      { column: target.column, row: target.row - 1 },
      { column: target.column, row: target.row + 1 },
    ].some(
      (neighbor) =>
        this.terrain.isInside(neighbor.column, neighbor.row) &&
        this.isSolidTile(neighbor),
    );
  }

  private targetKey(target: TargetBlockPosition) {
    return `${target.column},${target.row}`;
  }

  private isWithinPlayerRange(player: Player, target: TargetBlockPosition) {
    const playerColumn = Math.floor(
      (player.pos.x + TILE_PX / 2 - this.terrain.map.pos.x) /
        this.terrain.map.tileWidth,
    );
    const playerRow = Math.floor(
      (player.pos.y + TILE_PX / 2 - this.terrain.map.pos.y) /
        this.terrain.map.tileHeight,
    );
    const columnDistance = Math.abs(target.column - playerColumn);
    const rowDistance = Math.abs(target.row - playerRow);
    return Math.max(columnDistance, rowDistance) <= blockTargetRange;
  }

  private isBlockedByPlayer(target: TargetBlockPosition, localPlayer: Player) {
    const tileBounds = this.tileBounds(target);
    if (!localPlayer.isFlying && localPlayer.overlapsWorldBounds(tileBounds)) {
      return true;
    }
    return this.getRemotePlayers().some(({ player }) =>
      player.overlapsWorldBounds(tileBounds),
    );
  }

  private tileBounds(target: TargetBlockPosition) {
    const left =
      this.terrain.map.pos.x + target.column * this.terrain.map.tileWidth;
    const top =
      this.terrain.map.pos.y + target.row * this.terrain.map.tileHeight;
    return {
      left,
      right: left + this.terrain.map.tileWidth,
      top,
      bottom: top + this.terrain.map.tileHeight,
    };
  }

  private moveToTarget(target: TargetBlockPosition | null) {
    if (!target) {
      this.pos.x = -TILE_PX;
      this.pos.y = -TILE_PX;
      return;
    }
    this.pos.x =
      this.terrain.map.pos.x + target.column * this.terrain.map.tileWidth;
    this.pos.y =
      this.terrain.map.pos.y + target.row * this.terrain.map.tileHeight;
  }

  private syncHighlightVisibility(target: TargetBlockPosition | null) {
    this.graphics.visible = !!target;
    this.graphics.opacity = target ? 1 : 0;
  }

  private highlightTargetFor(placeTarget: TargetBlockPosition | null) {
    return placeTarget;
  }

  private updateHighlightColor(delta: number) {
    this.highlightElapsedMs += delta;
    this.highlightGraphic.setColor(
      blockHighlightColorAt(this.highlightElapsedMs),
    );
  }

  private updatePlacingTarget(target: TargetBlockPosition | null) {
    if (!this.isPlacePointerHeld) {
      return;
    }
    this.placeBlockAt(target);
  }

  private placeBlockAt(target: TargetBlockPosition | null) {
    if (!target) {
      this.lastPlacedTargetKey = null;
      return;
    }
    const targetKey = this.targetKey(target);
    if (this.lastPlacedTargetKey === targetKey) {
      return;
    }
    const localPlayer = this.getLocalPlayer();
    const placementMode = localPlayer?.isFlying ? "creative" : "survival";
    const kind = toolbarSelection.selectedBlockForMode(placementMode);
    if (!kind) {
      return;
    }
    this.lastPlacedTargetKey = targetKey;
    this.client.send(messageTypes.updateBlock, {
      column: target.column,
      row: target.row,
      solid: true,
      kind,
    });
  }

  private useSelectedPowerupItem() {
    const localPlayer = this.getLocalPlayer();
    if (!localPlayer) {
      return false;
    }
    if (localPlayer.isPaused) {
      return false;
    }
    if (!localPlayer.isAlive()) {
      return false;
    }
    const powerup = toolbarSelection.useSelectedPowerupItem();
    if (!powerup) {
      return false;
    }
    this.lastPlacedTargetKey = null;
    this.onUsePowerup(powerup);
    return true;
  }

  private startToolUse() {
    const localPlayer = this.getLocalPlayer();
    if (!localPlayer) {
      return;
    }
    if (localPlayer.isPaused) {
      return;
    }
    const powerup = toolbarSelection.selectedPowerupCan("mine")
      ? toolbarSelection.powerup()
      : "none";
    if (!localPlayer.keepBreakingBlock(Number.POSITIVE_INFINITY, powerup)) {
      return;
    }
  }

  private breakTargetInstantly(
    target: TargetBlockPosition,
    brokenWith: PlayerPowerup,
  ) {
    this.client.send(messageTypes.updateBlock, {
      column: target.column,
      row: target.row,
      solid: false,
      brokenWith,
      dropItems: false,
    });
  }

  private updateBreakingTargets(delta: number) {
    const localPlayer = this.getLocalPlayer();
    const activeLocal =
      localPlayer && !localPlayer.isPaused ? localPlayer : null;

    if (this.isPointerHeld && !activeLocal) {
      this.hideHitboxActors();
      this.stopToolUse();
      this.markBreakingTargetsUntouched();
      this.regenerateBreakingTargets(delta);
      return;
    }

    const pointerBreaks = this.isPointerHeld && activeLocal;
    const visualOnlyBreak =
      !this.isPointerHeld &&
      !!activeLocal &&
      activeLocal.isBreakingBlock;

    if (!pointerBreaks && !visualOnlyBreak) {
      this.hideHitboxActors();
      this.markBreakingTargetsUntouched();
      this.regenerateBreakingTargets(delta);
      return;
    }

    if (pointerBreaks) {
      this.startToolUse();
    }

    this.syncHitboxActors(activeLocal);
    this.markBreakingTargetsUntouched();
    if (pointerBreaks) {
      this.damageTargetsInHitboxes(activeLocal);
    }
    this.regenerateBreakingTargets(delta);
    this.removeMissingBreakingTargets();
  }

  private markBreakingTargetsUntouched() {
    Object.values(this.breakingTargetsByKey).forEach((entry) => {
      entry.isTouched = false;
    });
  }

  private damageTargetsInHitboxes(localPlayer: Player) {
    const frameIndex = localPlayer.currentBlockBreakFrameIndex();
    const hitboxes = localPlayer.currentBlockBreakHitboxes();
    const baseDamage = localPlayer.currentBlockBreakBaseDamage();
    const shouldApplyDamage = this.lastAppliedBlockBreakFrameIndex !== frameIndex;
    this.lastAppliedBlockBreakFrameIndex = frameIndex;
    const touchedTargets = hitboxes.flatMap((hitbox) =>
      this.targetsOverlappingBounds(
        this.hitboxWorldBounds(localPlayer, hitbox),
      ),
    );
    this.uniqueTargets(touchedTargets).forEach((target) => {
      if (localPlayer.isFlying) {
        this.breakTargetInstantly(target, toolbarSelection.powerup());
        return;
      }
      this.touchBreakingTarget(
        target,
        shouldApplyDamage ? baseDamage : 0,
        toolbarSelection.powerup(),
      );
    });
  }

  private touchBreakingTarget(
    target: TargetBlockPosition,
    damage: number,
    powerup: PlayerPowerup,
  ) {
    const entry = this.breakingTargetEntryFor(target, powerup);
    if (!entry) {
      return;
    }
    entry.isTouched = true;
    if (damage <= 0) {
      return;
    }
    entry.regenDelayRemainingMs = blockBreakRegenDelayMs;
    entry.health = Math.max(entry.health - damage, 0);
    this.syncBlockBreakVisual(entry, entry.health, entry.maxHealth, true);
    this.sendBlockBreakUpdate(
      entry.target,
      true,
      entry.health,
      entry.maxHealth,
      true,
    );
    if (entry.health > 0) {
      return;
    }
    this.client.send(messageTypes.updateBlock, {
      column: entry.target.column,
      row: entry.target.row,
      solid: false,
      brokenWith: entry.powerup,
    });
    this.removeBreakingTarget(entry);
  }

  private regenerateBreakingTargets(delta: number) {
    Object.values(this.breakingTargetsByKey).forEach((entry) => {
      if (entry.isTouched) {
        return;
      }
      if (entry.regenDelayRemainingMs > 0) {
        entry.regenDelayRemainingMs = Math.max(
          entry.regenDelayRemainingMs - delta,
          0,
        );
        return;
      }
      entry.health = Math.min(
        entry.health + entry.regenPerSecond * (delta / 1000),
        entry.maxHealth,
      );
      this.syncBlockBreakVisual(entry, entry.health, entry.maxHealth, false);
      this.sendBlockBreakUpdate(
        entry.target,
        true,
        entry.health,
        entry.maxHealth,
        false,
      );
      if (entry.health < entry.maxHealth) {
        return;
      }
      this.removeBreakingTarget(entry);
    });
  }

  private removeMissingBreakingTargets() {
    Object.values(this.breakingTargetsByKey).forEach((entry) => {
      if (this.terrain.isSolidAt(entry.target.column, entry.target.row)) {
        return;
      }
      this.removeBreakingTarget(entry);
    });
  }

  private stopToolUse() {
    this.lastAppliedBlockBreakFrameIndex = null;
    const localPlayer = this.getLocalPlayer();
    if (!localPlayer) {
      this.hideHitboxActors();
      return;
    }
    if (localPlayer.isPaused) {
      localPlayer.stopBlockBreakAction();
      this.hideHitboxActors();
      return;
    }
    localPlayer.releaseBlockBreakHold();
  }

  private syncHitboxActors(localPlayer: Player) {
    const hitboxes = localPlayer.currentBlockBreakHitboxes();
    hitboxes.forEach((hitbox, index) => {
      const bounds = this.hitboxWorldBounds(localPlayer, hitbox);
      const actor = this.hitboxActorAt(index);
      actor.pos = ex.vec(bounds.left, bounds.top);
      actor.graphics.use(
        new ex.Rectangle({
          width: bounds.right - bounds.left,
          height: bounds.bottom - bounds.top,
          color: blockBreakHitboxColor,
        }),
      );
      actor.graphics.visible = true;
      actor.graphics.opacity = blockBreakHitboxOpacity;
    });
    this.hitboxActors.slice(hitboxes.length).forEach((actor) => {
      actor.graphics.visible = false;
      actor.graphics.opacity = 0;
    });
  }

  private hitboxActorAt(index: number) {
    const actor = this.hitboxActors[index];
    if (actor) {
      return actor;
    }
    const createdActor = new ex.Actor({
      pos: hiddenActorPosition(),
      anchor: ex.vec(0, 0),
      width: 1,
      height: 1,
      z: blockBreakHitboxZ,
    });
    createdActor.graphics.anchor = ex.vec(0, 0);
    createdActor.graphics.visible = false;
    createdActor.graphics.opacity = 0;
    this.hitboxActors[index] = createdActor;
    this.engine?.add(createdActor);
    return createdActor;
  }

  private hideHitboxActors() {
    this.hitboxActors.forEach((actor) => {
      actor.pos = hiddenActorPosition();
      actor.graphics.visible = false;
      actor.graphics.opacity = 0;
    });
  }

  private breakingTargetEntryFor(
    target: TargetBlockPosition,
    powerup: PlayerPowerup,
  ) {
    const key = this.targetKey(target);
    const existingEntry = this.breakingTargetsByKey[key];
    if (existingEntry) {
      return existingEntry;
    }
    const block = this.terrain.blockAt(target.column, target.row);
    if (!block || !Number.isFinite(block.health)) {
      return null;
    }
    const actor = this.createBreakActor();
    const entry = {
      target,
      powerup,
      health: block.health,
      maxHealth: block.health,
      regenPerSecond: block.regenPerSecond,
      regenDelayRemainingMs: blockBreakRegenDelayMs,
      actor,
      particleState: null,
      isTouched: true,
    };
    this.breakingTargetsByKey[key] = entry;
    this.engine?.add(actor);
    this.moveBreakActorToTarget(actor, target);
    this.syncBlockBreakVisual(entry, entry.health, entry.maxHealth, false);
    return entry;
  }

  private removeBreakingTarget(entry: BreakingTargetEntry) {
    const key = this.targetKey(entry.target);
    this.sendBlockBreakUpdate(
      entry.target,
      false,
      entry.health,
      entry.maxHealth,
      false,
    );
    this.hideBlockBreakVisual(entry);
    entry.actor.kill();
    delete this.breakingTargetsByKey[key];
  }

  private syncBlockBreakVisual(
    entry: BlockBreakVisualEntry,
    health: number,
    maxHealth: number,
    isDamaging: boolean,
  ) {
    const frame = this.blockBreakGraphicFor(
      entry.target,
      this.damageRatioFor(health, maxHealth),
    );
    if (!frame) {
      this.hideBlockBreakVisual(entry);
      return;
    }
    this.moveBreakActorToTarget(entry.actor, entry.target);
    entry.actor.graphics.use(frame);
    entry.actor.graphics.visible = true;
    entry.actor.graphics.opacity = 1;
    this.syncBlockBreakVisualParticles(entry, isDamaging);
  }

  private hideBlockBreakVisual(entry: BlockBreakVisualEntry) {
    entry.actor.pos = hiddenActorPosition();
    entry.actor.graphics.visible = false;
    entry.actor.graphics.opacity = 0;
    entry.particleState = null;
  }

  private syncBlockBreakVisualParticles(
    entry: BlockBreakVisualEntry,
    isDamaging: boolean,
  ) {
    if (!isDamaging) {
      entry.particleState = null;
      return;
    }
    const particleState =
      entry.particleState ??
      this.breakParticleEmitter.createState(
        entry.target,
        Number.POSITIVE_INFINITY,
      );
    entry.particleState = particleState;
    this.breakParticleEmitter.updateState(particleState, blockBreakFrameDurationMs);
  }

  private sendBlockBreakUpdate(
    target: TargetBlockPosition,
    isBreaking: boolean,
    health?: number,
    maxHealth?: number,
    isDamaging?: boolean,
  ) {
    this.client.send(messageTypes.updateBlockBreak, {
      column: target.column,
      row: target.row,
      isBreaking,
      ...(health === undefined ? {} : { health }),
      ...(maxHealth === undefined ? {} : { maxHealth }),
      ...(isDamaging === undefined ? {} : { isDamaging }),
    });
  }

  private showRemoteBreakAnimation(
    playerId: string,
    target: TargetBlockPosition,
    health: number,
    maxHealth: number,
    isDamaging: boolean,
  ) {
    const entry = this.remoteBreakAnimationFor(playerId, target, maxHealth);
    this.syncBlockBreakVisual(entry, health, maxHealth, isDamaging);
    entry.health = health;
  }

  private hideRemoteBreakAnimation(playerId: string, target: TargetBlockPosition) {
    const targetKey = this.targetKey(target);
    const entry = this.remoteBreakAnimationsByPlayerId[playerId]?.[targetKey];
    if (!entry) {
      return;
    }
    this.hideBlockBreakVisual(entry);
    entry.actor.kill();
    delete this.remoteBreakAnimationsByPlayerId[playerId][targetKey];
  }

  private hideRemoteBreakAnimationsForPlayer(playerId: string) {
    Object.values(this.remoteBreakAnimationsByPlayerId[playerId] ?? {}).forEach(
      (entry) => {
        this.hideBlockBreakVisual(entry);
        entry.actor.kill();
      },
    );
    delete this.remoteBreakAnimationsByPlayerId[playerId];
  }

  private remoteBreakAnimationFor(
    playerId: string,
    target: TargetBlockPosition,
    maxHealth: number,
  ) {
    const targetKey = this.targetKey(target);
    const entries = this.remoteBreakAnimationsFor(playerId);
    const existingEntry = entries[targetKey];
    if (existingEntry) {
      return existingEntry;
    }
    const entry = {
      target,
      actor: this.createBreakActor(),
      particleState: null,
      health: maxHealth,
    };
    entries[targetKey] = entry;
    this.engine?.add(entry.actor);
    return entry;
  }

  private remoteBreakAnimationsFor(playerId: string) {
    const entries = this.remoteBreakAnimationsByPlayerId[playerId];
    if (entries) {
      return entries;
    }
    this.remoteBreakAnimationsByPlayerId[playerId] = {};
    return this.remoteBreakAnimationsByPlayerId[playerId];
  }

  private createBreakActor() {
    const actor = new ex.Actor({
      pos: hiddenActorPosition(),
      anchor: ex.vec(0, 0),
      width: TILE_PX,
      height: TILE_PX,
      z: blockBreakAnimationZ,
    });
    actor.graphics.anchor = ex.vec(0, 0);
    actor.graphics.visible = false;
    actor.graphics.opacity = 0;
    return actor;
  }

  private hitboxWorldBounds(
    player: Player,
    hitbox: { offset: ex.Vector; width: number; height: number },
  ): WorldBounds {
    const { width: frameW, height: frameH } = player.blockBreakFramePixelSize();
    const drawOffset = player.bodyGraphicsDrawOffset();
    const spriteTopLeft = ex.vec(
      player.pos.x + drawOffset.x - frameW / 2,
      player.pos.y + drawOffset.y - frameH / 2,
    );
    const left = player.isFacingLeft()
      ? spriteTopLeft.x + (frameW - hitbox.offset.x - hitbox.width)
      : spriteTopLeft.x + hitbox.offset.x;
    const top = spriteTopLeft.y + hitbox.offset.y;
    return {
      left,
      right: left + hitbox.width,
      top,
      bottom: top + hitbox.height,
    };
  }

  private targetsOverlappingBounds(bounds: WorldBounds) {
    const startColumn = Math.floor(
      (bounds.left - this.terrain.map.pos.x) / this.terrain.map.tileWidth,
    );
    const endColumn = Math.floor(
      (bounds.right - this.terrain.map.pos.x) / this.terrain.map.tileWidth,
    );
    const startRow = Math.floor(
      (bounds.top - this.terrain.map.pos.y) / this.terrain.map.tileHeight,
    );
    const endRow = Math.floor(
      (bounds.bottom - this.terrain.map.pos.y) / this.terrain.map.tileHeight,
    );
    const columnCount = Math.max(endColumn - startColumn + 1, 0);
    const rowCount = Math.max(endRow - startRow + 1, 0);
    return Array.from({ length: columnCount }, (_, columnOffset) =>
      Array.from({ length: rowCount }, (_, rowOffset) => ({
        column: startColumn + columnOffset,
        row: startRow + rowOffset,
      })),
    )
      .flat()
      .filter((target) => this.isBreakableTarget(target))
      .filter((target) => this.boundsOverlap(bounds, this.tileBounds(target)));
  }

  private uniqueTargets(targets: TargetBlockPosition[]) {
    return Object.values(
      Object.fromEntries(targets.map((target) => [this.targetKey(target), target])),
    ) as TargetBlockPosition[];
  }

  private isBreakableTarget(target: TargetBlockPosition) {
    if (!this.terrain.isInside(target.column, target.row)) {
      return false;
    }
    if (!this.terrain.isSolidAt(target.column, target.row)) {
      return false;
    }
    const block = this.terrain.blockAt(target.column, target.row);
    return !!block && Number.isFinite(block.health);
  }

  private boundsOverlap(a: WorldBounds, b: WorldBounds) {
    if (a.right <= b.left || a.left >= b.right) {
      return false;
    }
    if (a.bottom <= b.top || a.top >= b.bottom) {
      return false;
    }
    return true;
  }

  private moveBreakActorToTarget(actor: ex.Actor, target: TargetBlockPosition) {
    const topLeft = this.tileTopLeft(target);
    actor.pos.x = topLeft.x;
    actor.pos.y = topLeft.y;
  }

  private blockMaxHealthFor(target: TargetBlockPosition) {
    return this.terrain.blockAt(target.column, target.row)?.health ?? 1;
  }

  private damageRatioFor(health: number, maxHealth: number) {
    if (!Number.isFinite(maxHealth) || maxHealth <= 0) {
      return 0;
    }
    return Math.max(0, Math.min(1, 1 - health / maxHealth));
  }

  private blockBreakGraphicFor(target: TargetBlockPosition, damageRatio: number) {
    if (damageRatio <= 0) {
      return null;
    }
    const frameIndex = Math.min(
      Math.floor(damageRatio * blockBreakFrameCount),
      blockBreakFrameCount - 1,
    );
    return this.blockBreakFramesFor(target)[frameIndex]?.graphic ?? null;
  }

  private blockBreakFramesFor(target: TargetBlockPosition | null) {
    if (target && this.terrain.tileKindAt(target.column, target.row) === "mushroom") {
      return blockBreakFrameResources.map((frame) => ({
        graphic: new AlphaMaskedBlockBreakRaster(frame),
      }));
    }
    return blockBreakFrameResources.map((frame) => ({
      graphic: frame.toSprite(),
    }));
  }

  private tileTopLeft(target: TargetBlockPosition) {
    return ex.vec(
      this.terrain.map.pos.x + target.column * this.terrain.map.tileWidth,
      this.terrain.map.pos.y + target.row * this.terrain.map.tileHeight,
    );
  }
}
