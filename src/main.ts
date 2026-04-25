import * as ex from "excalibur";
import { Player } from "./actors/Player";
import { Resources } from "./resource";
import { Data, GameClient } from "./classes/GameClient";
import { TerrainTileMap } from "./classes/TerrainTileMap";

const localPlayerSlot = { player: null as Player | null };
const playerById: Record<string, Player> = {};

const loader = new ex.DefaultLoader({
  loadables: Object.values(Resources),
});

const viewWidth = 320;
const viewHeight = 180;
const worldWidth = 64 * 16;
const worldRows = 30;
const worldHeight = worldRows * 16;

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

const applyPositionFromPayloadIfPresent = (player: Player, payload: Data) => {
  if (payload.x) {
    player.pos.x = Number(payload.x);
  }
  if (payload.y) {
    player.pos.y = Number(payload.y);
  }
};

const syncMovementFieldsFromPayload = (player: Player, payload: Data) => {
  player.keyLeft = payload.kl ?? player.keyLeft;
  player.keyRight = payload.kr ?? player.keyRight;
  player.keyJump = payload.kj ?? player.keyJump;
  player.hspeed = payload.sh ?? player.hspeed;
  player.vspeed = payload.sv ?? player.vspeed;
};

const applyRemotePlayerUpdate = (payload: Data) => {
  const playerId = payload.id as string;
  const player = playerById[playerId];
  if (!player) {
    return;
  }
  applyPositionFromPayloadIfPresent(player, payload);
  syncMovementFieldsFromPayload(player, payload);
};

const joinExistingRemotePlayers = (
  game: ex.Engine,
  tilemap: ex.TileMap,
  playersData: Data,
) => {
  Object.entries(playersData).forEach(([peerId, row]) => {
    const x = Number(row.x);
    const y = Number(row.y);
    spawnPlayerAt(game, tilemap, peerId, x, y);
  });
};

game.start(loader).then(() => {
  const terrain = new TerrainTileMap({
    pos: ex.vec(0, 0),
    tileWidth: 16,
    tileHeight: 16,
    columns: Math.floor(worldWidth / 16),
    rows: worldRows,
    seed: 42,
  });
  const tilemap = terrain.map;
  game.add(tilemap);

  const client = new GameClient();
  client.listen({
    onConnect: (myPlayerId, playersData) => {
      localPlayerSlot.player = new Player(ex.vec(0, 0), tilemap, client);
      game.add(localPlayerSlot.player);
      client.send(
        "create_player",
        { id: myPlayerId, x: 0, y: 0 },
        { x: 0, y: 0 },
      );
      console.log("Players:", playersData);
      joinExistingRemotePlayers(game, tilemap, playersData);
    },
    onDisconnect: (gonePlayerId) => {
      playerById[gonePlayerId].kill();
      delete playerById[gonePlayerId];
    },
    listener: () => ({
      create_player: (payload) => {
        const { id, x, y } = payload;
        spawnPlayerAt(game, tilemap, id, x, y);
      },
      update_player: applyRemotePlayerUpdate,
    }),
  });
});
