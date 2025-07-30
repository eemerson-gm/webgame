import { GameServer } from "./classes/GameServer";
import express from "express";

const port = 80;
const app = express();
app.use(express.static("dist"));

const server = app.listen(port, () => {
  console.log(`HTTP server listening on port ${port}`);
});

const gameServer = new GameServer(server);
gameServer.listen({
  create_player: "others",
  update_player: "others",
});
