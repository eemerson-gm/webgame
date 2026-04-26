import * as ex from "excalibur";
import { BlockTargetingHighlight } from "./actors/BlockTargetingHighlight";
import { Player } from "./actors/Player";
import { Resources } from "./resource";
import { GameClient } from "./classes/GameClient";
import { messageTypes } from "./classes/GameProtocol";
import type {
  Data,
  PlayerKnockbackUpdate,
  TerrainBlockBreakUpdate,
  PlayerState,
  TerrainBlockUpdate,
  WorldTerrainPayload,
} from "./classes/GameProtocol";
import { TerrainTileMap } from "./classes/TerrainTileMap";
import { TileLightingOverlay } from "./classes/TileLightingOverlay";
import { TILE_PX } from "./world/worldConfig";

const localPlayerSlot = { player: null as Player | null };
const playerById: Record<string, Player> = {};
const worldSession = { terrain: null as TerrainTileMap | null };
const blockTargetingSlot = { highlight: null as BlockTargetingHighlight | null };
const syncLocalPauseState = (isPaused: boolean = document.hidden) => {
  localPlayerSlot.player?.syncPauseState(isPaused);
};
const addLocalPauseListeners = () => {
  document.addEventListener("visibilitychange", () => syncLocalPauseState());
  window.addEventListener("pagehide", () => syncLocalPauseState(true));
  window.addEventListener("pageshow", () => syncLocalPauseState(false));
  document.addEventListener("freeze", () => syncLocalPauseState(true));
  document.addEventListener("resume", () => syncLocalPauseState(false));
};

const loader = new ex.DefaultLoader({
  loadables: Object.values(Resources),
});

const viewWidth = 320;
const viewHeight = 180;
const browserActionGameKeyCodes = [
  "Tab",
  "Space",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
];

const game = new ex.Engine({
  width: viewWidth,
  height: viewHeight,
  canvasElementId: "game",
  antialiasing: false,
  backgroundColor: ex.Color.fromHex("#54C0CA"),
  pixelArt: true,
  snapToPixel: false,
  pixelRatio: 3,
  displayMode: ex.DisplayMode.FitContainer,
  fixedUpdateFps: 60,
});

const focusGameCanvas = (engine: ex.Engine) => {
  engine.canvas.tabIndex = 0;
  engine.canvas.addEventListener("pointerdown", () => engine.canvas.focus());
  engine.canvas.addEventListener("keydown", (event) => {
    if (!browserActionGameKeyCodes.includes(event.code)) {
      return;
    }
    event.preventDefault();
  });
};

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
  if (payload.x !== undefined) {
    player.pos.x = Number(payload.x);
  }
  if (payload.y !== undefined) {
    player.pos.y = Number(payload.y);
  }
};

const syncMovementFieldsFromPayload = (
  player: Player,
  payload: PlayerState,
) => {
  if (payload.isPaused !== undefined) {
    player.setPaused(payload.isPaused);
  }
  player.keyLeft = payload.keyLeft ?? player.keyLeft;
  player.keyRight = payload.keyRight ?? player.keyRight;
  player.keyJump = payload.keyJump ?? player.keyJump;
  player.keyDown = payload.keyDown ?? player.keyDown;
  player.keyUp = payload.keyUp ?? player.keyUp;
  if (payload.isUsingTool !== undefined) {
    player.syncToolUseState(payload.isUsingTool, undefined, payload.activeTool);
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
  if (playerState.isPaused) {
    blockTargetingSlot.highlight?.removeRemoteBreakAnimation(playerId);
  }
  syncMovementFieldsFromPayload(player, playerState);
};

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

const applyTerrainBlockBreakUpdate = (payload: Data) => {
  blockTargetingSlot.highlight?.applyRemoteBreakUpdate(
    payload as TerrainBlockBreakUpdate,
  );
};

const playerForKnockbackId = (playerId: string) => {
  if (clientSlot.client?.clientId === playerId) {
    return localPlayerSlot.player;
  }
  return playerById[playerId] ?? null;
};

const applyPlayerKnockbackUpdate = (payload: Data) => {
  const update = payload as PlayerKnockbackUpdate;
  if (!update.id) {
    return;
  }
  const attacker = playerForKnockbackId(update.id);
  const target = playerForKnockbackId(update.targetId);
  if (!attacker || !target) {
    return;
  }
  target.knockBackFrom(attacker);
};

const clientSlot = { client: null as GameClient | null };

game.start(loader).then(() => {
  focusGameCanvas(game);
  const client = new GameClient();
  clientSlot.client = client;
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
      const lighting = new TileLightingOverlay(terrain);
      worldSession.terrain = terrain;
      game.add(tilemap);
      terrain.borders.forEach((border) => game.add(border));
      game.add(lighting);

      localPlayerSlot.player = new Player(ex.vec(0, 0), tilemap, client);
      game.add(localPlayerSlot.player);
      blockTargetingSlot.highlight = new BlockTargetingHighlight(
        terrain,
        client,
        () => localPlayerSlot.player,
        (playerId) => playerById[playerId] ?? null,
        () =>
          Object.entries(playerById).map(([id, player]) => ({
            id,
            player,
          })),
        () => [],
      );
      game.add(blockTargetingSlot.highlight);
      client.send(messageTypes.createPlayer, { x: 0, y: 0 });
      addLocalPauseListeners();
      syncLocalPauseState();
      console.log("Players:", playersData);
      joinExistingRemotePlayers(game, tilemap, myPlayerId, playersData);
    },
    onDisconnect: (gonePlayerId) => {
      blockTargetingSlot.highlight?.removeRemoteBreakAnimation(gonePlayerId);
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
      [messageTypes.updateBlockBreak]: applyTerrainBlockBreakUpdate,
      [messageTypes.knockbackPlayer]: applyPlayerKnockbackUpdate,
    }),
  });
});
