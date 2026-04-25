import * as ex from "excalibur";
import { Player } from "./actors/Player";
import { Resources } from "./resource";
import { GameClient } from "./classes/GameClient";
import { messageTypes } from "./classes/GameProtocol";
import type {
  Data,
  PlayerState,
  TerrainBlockUpdate,
  WorldTerrainPayload,
} from "./classes/GameProtocol";
import { TerrainTileMap } from "./classes/TerrainTileMap";
import { TILE_PX } from "./world/worldConfig";

const localPlayerSlot = { player: null as Player | null };
const playerById: Record<string, Player> = {};
const worldSession = { terrain: null as TerrainTileMap | null };
const blockTargetRange = 2;
const blockBreakFrameDurationMs = 90;
const blockBreakFrameCount = 4;
const blockBreakDurationMs = blockBreakFrameDurationMs * blockBreakFrameCount;
const blockHighlightGradientDurationMs = 2200;
const blockHighlightOutlineThickness = 1;
const blockBreakAnimationZ = 9;
const blockHighlightZ = 10;
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

const colorChannelBetween = (start: number, end: number, progress: number) =>
  Math.round(start + (end - start) * progress);

const hexChannel = (channel: number) => channel.toString(16).padStart(2, "0");

const blockHighlightColorAt = (elapsedMs: number) => {
  const position =
    ((elapsedMs % blockHighlightGradientDurationMs) / blockHighlightGradientDurationMs) *
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

class BlockHighlightRaster extends ex.Raster {
  private outlineColor: string;

  constructor(color: string) {
    super({
      width: TILE_PX,
      height: TILE_PX,
      origin: ex.vec(0, 0),
      smoothing: false,
      filtering: ex.ImageFiltering.Pixel,
    });
    this.outlineColor = color;
  }

  override clone() {
    return new BlockHighlightRaster(this.outlineColor);
  }

  public setColor(color: string) {
    if (color === this.outlineColor) {
      return;
    }
    this.outlineColor = color;
    this.flagDirty();
  }

  override execute(ctx: CanvasRenderingContext2D) {
    ctx.strokeStyle = this.outlineColor;
    ctx.lineWidth = blockHighlightOutlineThickness;
    ctx.strokeRect(
      blockHighlightOutlineThickness / 2,
      blockHighlightOutlineThickness / 2,
      TILE_PX - blockHighlightOutlineThickness,
      TILE_PX - blockHighlightOutlineThickness,
    );
  }
}

const loader = new ex.DefaultLoader({
  loadables: Object.values(Resources),
});

const viewWidth = 320;
const viewHeight = 180;

const game = new ex.Engine({
  width: viewWidth,
  height: viewHeight,
  antialiasing: false,
  backgroundColor: ex.Color.fromHex("#54C0CA"),
  pixelArt: true,
  snapToPixel: false,
  pixelRatio: 3,
  displayMode: ex.DisplayMode.FitScreen,
  fixedUpdateFps: 60,
});

const isWorldTerrainPayload = (w: Data): w is WorldTerrainPayload => {
  if (!w) {
    return false;
  }
  if (typeof w.columns !== "number" || typeof w.rows !== "number") {
    return false;
  }
  if (!Array.isArray(w.surfaceStartByColumn)) {
    return false;
  }
  if (w.surfaceStartByColumn.length !== w.columns) {
    return false;
  }
  return true;
};

const spawnPlayerAt = (
  game: ex.Engine,
  tilemap: ex.TileMap,
  playerId: string,
  x: number,
  y: number,
) => {
  playerById[playerId] = new Player(ex.vec(x, y), tilemap);
  game.add(playerById[playerId]);
  return playerById[playerId];
};

const applyPositionFromPayloadIfPresent = (
  player: Player,
  payload: PlayerState,
) => {
  if (payload.x) {
    player.pos.x = Number(payload.x);
  }
  if (payload.y) {
    player.pos.y = Number(payload.y);
  }
};

const syncMovementFieldsFromPayload = (
  player: Player,
  payload: PlayerState,
) => {
  player.keyLeft = payload.keyLeft ?? player.keyLeft;
  player.keyRight = payload.keyRight ?? player.keyRight;
  player.keyJump = payload.keyJump ?? player.keyJump;
  player.keyDown = payload.keyDown ?? player.keyDown;
  player.keyUp = payload.keyUp ?? player.keyUp;
  if (payload.isUsingTool !== undefined) {
    player.syncToolUseState(payload.isUsingTool);
  }
  player.isFlying = payload.isFlying ?? player.isFlying;
  player.hspeed = payload.horizontalSpeed ?? player.hspeed;
  player.vspeed = payload.verticalSpeed ?? player.vspeed;
};

const applyRemotePlayerUpdate = (payload: Data) => {
  const playerState = payload as PlayerState;
  const playerId = playerState.id as string;
  const player = playerById[playerId];
  if (!player) {
    return;
  }
  applyPositionFromPayloadIfPresent(player, playerState);
  syncMovementFieldsFromPayload(player, playerState);
};

class BlockTargetingHighlight extends ex.Actor {
  private readonly terrain: TerrainTileMap;
  private readonly client: GameClient;
  private readonly highlightGraphic: BlockHighlightRaster;
  private readonly breakAnimation: ex.Animation;
  private readonly breakAnimationActor: ex.Actor;
  private highlightElapsedMs: number = 0;
  private isPointerHeld: boolean = false;
  private breakingTarget: TargetBlockPosition | null = null;
  private breakProgressMs: number = 0;

  constructor(terrain: TerrainTileMap, client: GameClient) {
    super({
      pos: ex.vec(-TILE_PX, -TILE_PX),
      anchor: ex.vec(0, 0),
      width: TILE_PX,
      height: TILE_PX,
      z: blockHighlightZ,
    });
    this.terrain = terrain;
    this.client = client;
    this.highlightGraphic = new BlockHighlightRaster(blockHighlightColorAt(0));
    this.graphics.anchor = ex.vec(0, 0);
    this.graphics.use(this.highlightGraphic);
    this.breakAnimation = new ex.Animation({
      frames: [
        { graphic: Resources.BlockBreak1.toSprite() },
        { graphic: Resources.BlockBreak2.toSprite() },
        { graphic: Resources.BlockBreak3.toSprite() },
        { graphic: Resources.BlockBreak4.toSprite() },
      ],
      frameDuration: blockBreakFrameDurationMs,
      strategy: ex.AnimationStrategy.End,
    });
    this.breakAnimationActor = new ex.Actor({
      pos: hiddenActorPosition(),
      anchor: ex.vec(0, 0),
      width: TILE_PX,
      height: TILE_PX,
      z: blockBreakAnimationZ,
    });
    this.breakAnimationActor.graphics.anchor = ex.vec(0, 0);
    this.breakAnimationActor.graphics.use(this.breakAnimation);
  }

  override onInitialize(engine: ex.Engine) {
    engine.add(this.breakAnimationActor);
    engine.input.pointers.primary.on("down", (event) => {
      this.isPointerHeld = true;
      this.startToolUseAt(this.targetAt(event.worldPos));
    });
    engine.input.pointers.primary.on("up", () => {
      this.isPointerHeld = false;
      this.cancelBreakingTarget();
    });
    engine.input.pointers.primary.on("cancel", () => {
      this.isPointerHeld = false;
      this.cancelBreakingTarget();
    });
  }

  override onPostUpdate(engine: ex.Engine, delta: number) {
    const mouseWorldPos = this.currentMouseWorldPosition(engine);
    const target = this.targetAt(mouseWorldPos);
    this.moveToTarget(target);
    this.updateHighlightColor(delta);
    this.updateBreakingTarget(target, delta);
  }

  private currentMouseWorldPosition(engine: ex.Engine) {
    const mouseScreenPos = engine.input.pointers.primary.lastScreenPos;
    if (!mouseScreenPos) {
      return null;
    }
    return engine.screenToWorldCoordinates(mouseScreenPos);
  }

  private targetAt(mouseWorldPos: ex.Vector | null) {
    const localPlayer = localPlayerSlot.player;
    if (!mouseWorldPos || !localPlayer) {
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

  private tilePositionAt(worldPos: ex.Vector) {
    return {
      column: Math.floor((worldPos.x - this.terrain.map.pos.x) / this.terrain.map.tileWidth),
      row: Math.floor((worldPos.y - this.terrain.map.pos.y) / this.terrain.map.tileHeight),
    };
  }

  private isSolidTile(target: TargetBlockPosition) {
    return !!this.terrain.map.getTile(target.column, target.row)?.getGraphics().length;
  }

  private isWithinPlayerRange(player: Player, target: TargetBlockPosition) {
    const playerColumn = Math.floor(
      (player.pos.x + TILE_PX / 2 - this.terrain.map.pos.x) / this.terrain.map.tileWidth,
    );
    const playerRow = Math.floor(
      (player.pos.y + TILE_PX / 2 - this.terrain.map.pos.y) / this.terrain.map.tileHeight,
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
    this.pos.x = this.terrain.map.pos.x + target.column * this.terrain.map.tileWidth;
    this.pos.y = this.terrain.map.pos.y + target.row * this.terrain.map.tileHeight;
  }

  private updateHighlightColor(delta: number) {
    this.highlightElapsedMs += delta;
    this.highlightGraphic.setColor(blockHighlightColorAt(this.highlightElapsedMs));
  }

  private startToolUseAt(target: TargetBlockPosition | null) {
    if (target) {
      this.startBreakingTarget(target);
      return;
    }
    localPlayerSlot.player?.useTool();
  }

  private startBreakingTarget(target: TargetBlockPosition | null) {
    if (!target) {
      return;
    }
    const localPlayer = localPlayerSlot.player;
    if (!localPlayer) {
      return;
    }
    if (!localPlayer.isUsingTool && !localPlayer.useTool(Number.POSITIVE_INFINITY)) {
      return;
    }
    this.breakingTarget = target;
    this.breakProgressMs = 0;
    this.moveBreakAnimationToTarget(target);
    this.breakAnimation.reset();
    this.breakAnimation.play();
  }

  private updateBreakingTarget(target: TargetBlockPosition | null, delta: number) {
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
    if (!this.breakingTarget || !this.isSameTarget(target, this.breakingTarget)) {
      this.startBreakingTarget(target);
      return;
    }
    this.breakProgressMs += delta;
    this.moveBreakAnimationToTarget(this.breakingTarget);
    if (this.breakProgressMs < blockBreakDurationMs) {
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
    const wasBreakingTarget = !!this.breakingTarget;
    this.breakingTarget = null;
    this.breakProgressMs = 0;
    this.breakAnimationActor.pos = hiddenActorPosition();
    if (wasBreakingTarget) {
      localPlayerSlot.player?.stopUsingToolAction();
    }
  }

  private moveBreakAnimationToTarget(target: TargetBlockPosition) {
    this.breakAnimationActor.pos.x =
      this.terrain.map.pos.x + target.column * this.terrain.map.tileWidth;
    this.breakAnimationActor.pos.y =
      this.terrain.map.pos.y + target.row * this.terrain.map.tileHeight;
  }

  private isSameTarget(a: TargetBlockPosition, b: TargetBlockPosition) {
    if (a.column !== b.column) {
      return false;
    }
    return a.row === b.row;
  }
}

const joinExistingRemotePlayers = (
  game: ex.Engine,
  tilemap: ex.TileMap,
  myPlayerId: string,
  playersData: Record<string, PlayerState>,
) => {
  Object.entries(playersData).forEach(([peerId, row]) => {
    if (peerId === myPlayerId) {
      return;
    }
    const x = Number(row.x);
    const y = Number(row.y);
    const player = spawnPlayerAt(game, tilemap, peerId, x, y);
    syncMovementFieldsFromPayload(player, row);
  });
};

const applyTerrainBlockUpdate = (payload: Data) => {
  const terrain = worldSession.terrain;
  if (!terrain) {
    return;
  }
  terrain.applyBlockUpdate(payload as TerrainBlockUpdate);
};

game.start(loader).then(() => {
  const client = new GameClient();
  client.listen({
    onConnect: (myPlayerId, playersData, world) => {
      if (!isWorldTerrainPayload(world)) {
        console.error("Invalid or missing world payload from server");
        return;
      }
      const terrain = new TerrainTileMap({
        pos: ex.vec(0, 0),
        tileWidth: TILE_PX,
        tileHeight: TILE_PX,
        columns: world.columns,
        rows: world.rows,
        surfaceStartByColumn: world.surfaceStartByColumn,
        solidTiles: world.solidTiles,
        terrainTiles: world.terrainTiles,
      });
      const tilemap = terrain.map;
      worldSession.terrain = terrain;
      game.add(tilemap);
      terrain.borders.forEach((border) => game.add(border));

      localPlayerSlot.player = new Player(ex.vec(0, 0), tilemap, client);
      game.add(localPlayerSlot.player);
      game.add(new BlockTargetingHighlight(terrain, client));
      client.send(messageTypes.createPlayer, { x: 0, y: 0 }, { x: 0, y: 0 });
      console.log("Players:", playersData);
      joinExistingRemotePlayers(game, tilemap, myPlayerId, playersData);
    },
    onDisconnect: (gonePlayerId) => {
      playerById[gonePlayerId].kill();
      delete playerById[gonePlayerId];
    },
    listener: () => ({
      [messageTypes.createPlayer]: (payload) => {
        const terrain = worldSession.terrain;
        if (!terrain) {
          return;
        }
        const { id, x, y } = payload as PlayerState;
        if (!id) {
          return;
        }
        spawnPlayerAt(game, terrain.map, id, Number(x), Number(y));
      },
      [messageTypes.updatePlayer]: applyRemotePlayerUpdate,
      [messageTypes.updateBlock]: applyTerrainBlockUpdate,
    }),
  });
});
