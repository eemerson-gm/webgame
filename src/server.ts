import { GameServer } from "./classes/GameServer";
import { messageTypes } from "./classes/GameProtocol";
import express from "express";
import * as fs from "fs/promises";
import path from "path";

const port = 8080;
const app = express();
app.use(express.static("dist"));

const workspaceRoot = process.cwd();
const publicDir = path.join(workspaceRoot, "public");
const assetsDir = path.join(publicDir, "assets");

app.use("/assets", express.static(assetsDir));

const pascalCaseFromFileName = (fileName: string): string => {
  const withoutExt = fileName.slice(0, Math.max(0, fileName.length - 4));
  const parts = withoutExt.split("_").filter((p) => p.length > 0);
  return parts.map((part) => part.substring(0, 1).toUpperCase() + part.substring(1).toLowerCase()).join("");
};

app.get("/api/sprites", async (_req, res) => {
  const entries = await fs.readdir(assetsDir, { withFileTypes: false });
  const sprites = entries
    .filter((name) => name.toLowerCase().endsWith(".png"))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({
      key: pascalCaseFromFileName(name),
      url: "/assets/" + name,
    }));
  res.json({ sprites });
});

const server = app.listen(port, () => {
  console.log(`[HTTP] Listening on port ${port}`);
});

const gameServer = new GameServer(server);
gameServer.listen({
  [messageTypes.createPlayer]: "others",
  [messageTypes.updatePlayer]: "others",
  [messageTypes.updatePing]: "others",
  [messageTypes.knockbackPlayer]: "all",
  [messageTypes.damagePlayer]: "all",
  [messageTypes.damageEntity]: "all",
  [messageTypes.createEntity]: "all",
  [messageTypes.updateEntity]: "all",
  [messageTypes.ping]: "player",
});
