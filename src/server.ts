import { GameServer } from "./classes/GameServer";
import express from "express";

const app = express();
app.use(express.static("dist"));
app.listen(8082, () => {
  console.log("HTTP server listening on port 8082");
});

const server = new GameServer(8081);
server.listen({
  create_player: "others",
  update_player: "others",
});
