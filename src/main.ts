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
    spawnPlayerAt(game, tilemap, peerId, x, y);
  });
};

const tilePositionAt = (worldPos: ex.Vector, tilemap: ex.TileMap) => ({
  column: Math.floor((worldPos.x - tilemap.pos.x) / tilemap.tileWidth),
  row: Math.floor((worldPos.y - tilemap.pos.y) / tilemap.tileHeight),
});

const applyTerrainBlockUpdate = (payload: Data) => {
  const terrain = worldSession.terrain;
  if (!terrain) {
    return;
  }
  terrain.applyBlockUpdate(payload as TerrainBlockUpdate);
};

const attachTestBlockBreaking = (terrain: TerrainTileMap, client: GameClient) => {
  game.input.pointers.primary.on("down", (event) => {
    const { column, row } = tilePositionAt(event.worldPos, terrain.map);
    client.send(messageTypes.updateBlock, { column, row, solid: false });
  });
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
      attachTestBlockBreaking(terrain, client);

      localPlayerSlot.player = new Player(ex.vec(0, 0), tilemap, client);
      game.add(localPlayerSlot.player);
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
