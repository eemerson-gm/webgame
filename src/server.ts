import { GameServer } from "./classes/GameServer";
import { messageTypes } from "./classes/GameProtocol";
import express from "express";

const port = 8080;
const app = express();
app.use(express.static("dist"));

const server = app.listen(port, () => {
  console.log(`[HTTP] Listening on port ${port}`);
});

const gameServer = new GameServer(server);
gameServer.listen({
  [messageTypes.createPlayer]: "others",
  [messageTypes.updatePlayer]: "others",
  [messageTypes.updateBlock]: "all",
  [messageTypes.updateBlockBreak]: "others",
});
