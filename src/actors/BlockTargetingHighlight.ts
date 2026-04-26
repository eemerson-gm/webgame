import * as ex from "excalibur";
import type { GameClient } from "../classes/GameClient";
import { messageTypes } from "../classes/GameProtocol";
import type {
  TerrainBlockBreakUpdate,
  TerrainTileKind,
} from "../classes/GameProtocol";
import type { TerrainTileMap } from "../classes/TerrainTileMap";
import { Resources } from "../resource";
import { TILE_PX } from "../world/worldConfig";
import { BlockHighlightRaster } from "./BlockHighlightRaster";
import type { EntityActor } from "./EntityActor";
import type { Player } from "./Player";

const blockTargetRange = 2;
const blockBreakFrameDurationMs = 90;
const blockBreakFrameCount = 4;
const blockHighlightGradientDurationMs = 2200;
const blockBreakAnimationZ = 9;
const blockHighlightZ = 10;
const lightBlockPlacementKeys = ["ShiftLeft", "ShiftRight", "Shift"];
const blockHighlightGradient = [
  [255, 214, 36],
  [255, 255, 255],
  [255, 242, 122],
  [255, 255, 255],
];
const hiddenActorPosition = () => ex.vec(-100000, -100000);

type TargetBlockPosition = {
  column: number;
  row: number;
};

type RemotePlayerEntry = {
  id: string;
  player: Player;
};

type LocalPlayerProvider = () => Player | null;
type RemotePlayerProvider = (playerId: string) => Player | null;
type RemotePlayersProvider = () => RemotePlayerEntry[];
type EntityProvider = () => EntityActor[];

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

export class BlockTargetingHighlight extends ex.Actor {
  private readonly terrain: TerrainTileMap;
  private readonly client: GameClient;
  private readonly getLocalPlayer: LocalPlayerProvider;
  private readonly getRemotePlayer: RemotePlayerProvider;
  private readonly getRemotePlayers: RemotePlayersProvider;
  private readonly getEntities: EntityProvider;
  private readonly highlightGraphic: BlockHighlightRaster;
  private breakAnimation: ex.Animation;
  private readonly breakAnimationActor: ex.Actor;
  private readonly remoteBreakAnimationsByPlayerId: Record<
    string,
    ex.Animation
  >;
  private readonly remoteBreakAnimationActorsByPlayerId: Record<
    string,
    ex.Actor
  >;
  private readonly entitiesHitByCurrentSwordSwing = new Set<EntityActor>();
  private readonly playersHitByCurrentSwordSwing = new Set<Player>();
  private engine?: ex.Engine;
  private highlightElapsedMs: number = 0;
  private isPointerHeld: boolean = false;
  private isPlacePointerHeld: boolean = false;
  private lastPlacedTargetKey: string | null = null;
  private breakingTarget: TargetBlockPosition | null = null;
  private breakProgressMs: number = 0;

  constructor(
    terrain: TerrainTileMap,
    client: GameClient,
    getLocalPlayer: LocalPlayerProvider,
    getRemotePlayer: RemotePlayerProvider,
    getRemotePlayers: RemotePlayersProvider,
    getEntities: EntityProvider,
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
    this.getEntities = getEntities;
    this.highlightGraphic = new BlockHighlightRaster(blockHighlightColorAt(0));
    this.graphics.anchor = ex.vec(0, 0);
    this.graphics.use(this.highlightGraphic);
    this.graphics.visible = false;
    this.graphics.opacity = 0;
    this.breakAnimation = this.createBlockBreakAnimation();
    this.breakAnimationActor = new ex.Actor({
      pos: hiddenActorPosition(),
      anchor: ex.vec(0, 0),
      width: TILE_PX,
      height: TILE_PX,
      z: blockBreakAnimationZ,
    });
    this.breakAnimationActor.graphics.anchor = ex.vec(0, 0);
    this.breakAnimationActor.graphics.use(this.breakAnimation);
    this.remoteBreakAnimationsByPlayerId = {};
    this.remoteBreakAnimationActorsByPlayerId = {};
  }

  override onInitialize(engine: ex.Engine) {
    this.engine = engine;
    engine.add(this.breakAnimationActor);
    engine.canvas.addEventListener("contextmenu", (event) => {
      event.preventDefault();
    });
    engine.input.pointers.primary.on("down", (event) => {
      if (event.button !== ex.PointerButton.Left) {
        return;
      }
      this.isPointerHeld = true;
      this.startToolUseAt(this.targetAt(event.worldPos));
    });
    engine.input.pointers.primary.on("down", (event) => {
      if (event.button !== ex.PointerButton.Right) {
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
      this.cancelBreakingTarget();
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
      this.cancelBreakingTarget();
    });
  }

  override onPostUpdate(engine: ex.Engine, delta: number) {
    const mouseWorldPos = this.currentMouseWorldPosition(engine);
    const target = this.targetAt(mouseWorldPos);
    const placeTarget = this.placeTargetAt(mouseWorldPos);
    this.moveToTarget(target);
    this.syncHighlightVisibility(target);
    this.updateHighlightColor(delta);
    this.updatePlacingTarget(placeTarget);
    this.updateBreakingTarget(target, delta);
    this.hitEntitiesTouchingSword();
    this.hitPlayersTouchingSword();
  }

  public applyRemoteBreakUpdate(update: TerrainBlockBreakUpdate) {
    if (!update.id) {
      return;
    }
    if (this.getRemotePlayer(update.id)?.isPaused) {
      this.hideRemoteBreakAnimation(update.id);
      return;
    }
    if (!update.isBreaking) {
      this.hideRemoteBreakAnimation(update.id);
      this.getRemotePlayer(update.id)?.syncToolUseState(false);
      return;
    }
    const target = {
      column: update.column,
      row: update.row,
    };
    this.showRemoteBreakAnimation(
      update.id,
      target,
      update.breakDurationMs ?? this.breakDurationFor(target),
    );
    this.getRemotePlayer(update.id)?.syncToolUseState(
      true,
      Number.POSITIVE_INFINITY,
      "pickaxe",
    );
  }

  public removeRemoteBreakAnimation(playerId: string) {
    this.hideRemoteBreakAnimation(playerId);
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
    if (!this.isWithinPlayerRange(localPlayer, target)) {
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
    const target = this.tilePositionAt(mouseWorldPos);
    if (this.isSolidTile(target)) {
      return null;
    }
    if (!this.isWithinPlayerRange(localPlayer, target)) {
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
    return !!this.terrain.blockAt(target.column, target.row);
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
    this.lastPlacedTargetKey = targetKey;
    this.client.send(messageTypes.updateBlock, {
      column: target.column,
      row: target.row,
      solid: true,
      kind: this.placeBlockKind(),
    });
  }

  private placeBlockKind(): TerrainTileKind {
    if (
      this.engine &&
      lightBlockPlacementKeys.some((key) =>
        this.engine?.input.keyboard.isHeld(key as ex.Keys),
      )
    ) {
      return "lamp";
    }
    return "dirt";
  }

  private startToolUseAt(target: TargetBlockPosition | null) {
    if (target) {
      this.startBreakingTarget(target);
      return;
    }
    const localPlayer = this.getLocalPlayer();
    if (!localPlayer) {
      return;
    }
    if (!localPlayer.useSword()) {
      return;
    }
    this.hitEntitiesTouchingSword();
    this.hitPlayersTouchingSword();
  }

  private hitEntitiesTouchingSword() {
    const localPlayer = this.getLocalPlayer();
    const swordBounds = localPlayer?.swordHitBounds();
    if (!localPlayer || localPlayer.isPaused || !swordBounds) {
      this.entitiesHitByCurrentSwordSwing.clear();
      return;
    }
    this.getEntities()
      .filter((entity) => !this.entitiesHitByCurrentSwordSwing.has(entity))
      .filter((entity) => entity.overlapsWorldBounds(swordBounds))
      .slice(0, 1)
      .forEach((entity) => {
        this.entitiesHitByCurrentSwordSwing.add(entity);
        entity.knockBackFrom(localPlayer);
      });
  }

  private hitPlayersTouchingSword() {
    const localPlayer = this.getLocalPlayer();
    const swordBounds = localPlayer?.swordHitBounds();
    if (!localPlayer || localPlayer.isPaused || !swordBounds) {
      this.playersHitByCurrentSwordSwing.clear();
      return;
    }
    this.getRemotePlayers()
      .filter(({ player }) => !this.playersHitByCurrentSwordSwing.has(player))
      .filter(({ player }) => !player.isPaused)
      .filter(({ player }) => player.overlapsWorldBounds(swordBounds))
      .slice(0, 1)
      .forEach(({ id, player }) => {
        this.playersHitByCurrentSwordSwing.add(player);
        player.knockBackFrom(localPlayer);
        this.client.send(messageTypes.knockbackPlayer, { targetId: id });
      });
  }

  private startBreakingTarget(target: TargetBlockPosition | null) {
    if (!target) {
      return;
    }
    const localPlayer = this.getLocalPlayer();
    if (!localPlayer) {
      return;
    }
    if (localPlayer.isPaused) {
      return;
    }
    const breakDurationMs = this.breakDurationFor(target);
    if (!Number.isFinite(breakDurationMs)) {
      return;
    }
    if (!localPlayer.keepUsingTool(Number.POSITIVE_INFINITY, "pickaxe")) {
      return;
    }
    this.sendBlockBreakUpdate(target, true, breakDurationMs);
    this.breakingTarget = target;
    this.breakProgressMs = 0;
    this.moveBreakAnimationToTarget(target);
    this.breakAnimation = this.createBlockBreakAnimation(breakDurationMs);
    this.breakAnimationActor.graphics.use(this.breakAnimation);
    this.breakAnimation.reset();
    this.breakAnimation.play();
  }

  private updateBreakingTarget(
    target: TargetBlockPosition | null,
    delta: number,
  ) {
    if (!this.isPointerHeld) {
      this.cancelBreakingTarget();
      return;
    }
    if (!target) {
      if (this.breakingTarget) {
        this.cancelBreakingTarget();
      }
      return;
    }
    if (
      !this.breakingTarget ||
      !this.isSameTarget(target, this.breakingTarget)
    ) {
      this.startBreakingTarget(target);
      return;
    }
    this.breakProgressMs += delta;
    this.moveBreakAnimationToTarget(this.breakingTarget);
    if (this.breakProgressMs < this.breakDurationFor(this.breakingTarget)) {
      return;
    }
    this.client.send(messageTypes.updateBlock, {
      column: this.breakingTarget.column,
      row: this.breakingTarget.row,
      solid: false,
    });
    this.cancelBreakingTarget();
  }

  private cancelBreakingTarget() {
    const target = this.breakingTarget;
    const wasBreakingTarget = !!target;
    if (target) {
      this.sendBlockBreakUpdate(target, false);
    }
    this.breakingTarget = null;
    this.breakProgressMs = 0;
    this.breakAnimationActor.pos = hiddenActorPosition();
    if (wasBreakingTarget) {
      this.getLocalPlayer()?.stopUsingToolAction();
    }
  }

  private sendBlockBreakUpdate(
    target: TargetBlockPosition,
    isBreaking: boolean,
    breakDurationMs?: number,
  ) {
    this.client.send(messageTypes.updateBlockBreak, {
      column: target.column,
      row: target.row,
      isBreaking,
      ...(breakDurationMs === undefined ? {} : { breakDurationMs }),
    });
  }

  private showRemoteBreakAnimation(
    playerId: string,
    target: TargetBlockPosition,
    breakDurationMs: number,
  ) {
    const actor = this.remoteBreakAnimationActorFor(playerId);
    const animation = this.createBlockBreakAnimation(breakDurationMs);
    this.remoteBreakAnimationsByPlayerId[playerId] = animation;
    actor.graphics.use(animation);
    actor.pos.x =
      this.terrain.map.pos.x + target.column * this.terrain.map.tileWidth;
    actor.pos.y =
      this.terrain.map.pos.y + target.row * this.terrain.map.tileHeight;
    animation.reset();
    animation.play();
  }

  private hideRemoteBreakAnimation(playerId: string) {
    const actor = this.remoteBreakAnimationActorsByPlayerId[playerId];
    if (!actor) {
      return;
    }
    actor.pos = hiddenActorPosition();
  }

  private remoteBreakAnimationActorFor(playerId: string) {
    const existingActor = this.remoteBreakAnimationActorsByPlayerId[playerId];
    if (existingActor) {
      return existingActor;
    }
    const actor = new ex.Actor({
      pos: hiddenActorPosition(),
      anchor: ex.vec(0, 0),
      width: TILE_PX,
      height: TILE_PX,
      z: blockBreakAnimationZ,
    });
    actor.graphics.anchor = ex.vec(0, 0);
    actor.graphics.use(this.remoteBreakAnimationFor(playerId));
    this.remoteBreakAnimationActorsByPlayerId[playerId] = actor;
    this.engine?.add(actor);
    return actor;
  }

  private remoteBreakAnimationFor(playerId: string) {
    const existingAnimation = this.remoteBreakAnimationsByPlayerId[playerId];
    if (existingAnimation) {
      return existingAnimation;
    }
    const animation = this.createBlockBreakAnimation();
    this.remoteBreakAnimationsByPlayerId[playerId] = animation;
    return animation;
  }

  private createBlockBreakAnimation(
    breakDurationMs = blockBreakFrameDurationMs * blockBreakFrameCount,
  ) {
    return new ex.Animation({
      frames: [
        { graphic: Resources.BlockBreak1.toSprite() },
        { graphic: Resources.BlockBreak2.toSprite() },
        { graphic: Resources.BlockBreak3.toSprite() },
        { graphic: Resources.BlockBreak4.toSprite() },
      ],
      frameDuration: breakDurationMs / blockBreakFrameCount,
      strategy: ex.AnimationStrategy.End,
    });
  }

  private moveBreakAnimationToTarget(target: TargetBlockPosition) {
    this.breakAnimationActor.pos.x =
      this.terrain.map.pos.x + target.column * this.terrain.map.tileWidth;
    this.breakAnimationActor.pos.y =
      this.terrain.map.pos.y + target.row * this.terrain.map.tileHeight;
  }

  private breakDurationFor(target: TargetBlockPosition) {
    return this.terrain.blockAt(target.column, target.row)?.breakDurationMs ??
      Number.POSITIVE_INFINITY;
  }

  private isSameTarget(a: TargetBlockPosition, b: TargetBlockPosition) {
    if (a.column !== b.column) {
      return false;
    }
    return a.row === b.row;
  }
}
