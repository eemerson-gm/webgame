import * as ex from "excalibur";
import { Player } from "./actors/Player";
import { Resources } from "./resource";
import { Data, GameClient } from "./classes/GameClient";

const localPlayerSlot = { player: null as Player | null };
const playerById: Record<string, Player> = {};

const loader = new ex.DefaultLoader({
  loadables: Object.values(Resources),
});

const gameWidth = 320;
const gameHeight = 180;

const game = new ex.Engine({
  width: gameWidth,
  height: gameHeight,
  antialiasing: false,
  backgroundColor: ex.Color.fromHex("#54C0CA"),
  pixelArt: true,
  displayMode: ex.DisplayMode.FitScreen,
  fixedUpdateFps: 60,
});

const placeGroundTiles = (tilemap: ex.TileMap) => {
  const groundRowStart = tilemap.rows - 4;
  tilemap.tiles.forEach((tile) => {
    if (tile.y <= groundRowStart) {
      return;
    }
    tile.addGraphic(Resources.Block.toSprite());
  });
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
  const tilemap = new ex.TileMap({
    pos: ex.vec(0, 0),
    tileWidth: 16,
    tileHeight: 16,
    columns: Math.floor(gameWidth / 16),
    rows: Math.floor(gameHeight / 16),
    renderFromTopOfGraphic: true,
  });
  placeGroundTiles(tilemap);
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
