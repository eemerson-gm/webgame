import { WebSocketServer, WebSocket } from "ws";
import { GameServer } from "./classes/GameServer";

const server = new GameServer();
server.listen({
  create_player: "others",
  update_player: "others",
});
