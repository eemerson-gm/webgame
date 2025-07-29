import * as ex from "excalibur";
import { Player } from "./actors/Player";
import { Resources } from "./resource";
import { Data, GameClient, MessageEvents } from "./classes/GameClient";

let localPlayer: Player | null = null;
const players: Record<string, Player> = {};

const loader = new ex.Loader(Object.values(Resources));
const gameWidth = 320;
const gameHeight = 180;
const game = new ex.Engine({
  width: gameWidth,
  height: gameHeight,
  antialiasing: false,
  backgroundColor: ex.Color.fromHex("#54C0CA"),
  pixelArt: true,
  displayMode: ex.DisplayMode.FitScreen,
});
game.start(loader).then(() => {
  const tilemap = new ex.TileMap({
    pos: ex.vec(0, 0),
    tileWidth: 16,
    tileHeight: 16,
    columns: Math.floor(gameWidth / 16),
    rows: Math.floor(gameHeight / 16),
    renderFromTopOfGraphic: true,
  });
  for (const tile of tilemap.tiles) {
    if (tile.y > tilemap.rows - 4) {
      tile.addGraphic(Resources.Block.toSprite());
    }
  }
  game.add(tilemap);

  const addPlayer = (id: string, x: number, y: number) => {
    players[id] = new Player(ex.vec(x, y), tilemap);
    game.add(players[id]);
  };

  const client = new GameClient();
  client.listen({
    onConnect: (id, playersData) => {
      localPlayer = new Player(ex.vec(0, 0), tilemap, client);
      game.add(localPlayer);
      client.send("create_player", { id, x: 0, y: 0 }, { x: 0, y: 0 });
      console.log("Players:", playersData);
      for (const [id, data] of Object.entries(playersData)) {
        const { x, y } = data;
        addPlayer(id, x, y);
      }
    },
    onDisconnect: (id) => {
      players[id].kill();
      delete players[id];
    },
    listener: () => ({
      create_player: (payload) => {
        const { id, x, y } = payload;
        addPlayer(id, x, y);
      },
      update_player: (payload) => {
        const { id, x, y, keys } = payload;
        const player = players[id];
        if (!player) {
          return;
        }
        player.keyLeft = keys.left;
        player.keyRight = keys.right;
        player.keyJump = keys.jump;
        player.pos.x = x;
        player.pos.y = y;
      },
    }),
  });
});
