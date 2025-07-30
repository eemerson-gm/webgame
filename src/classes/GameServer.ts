import { WebSocketServer, WebSocket } from "ws";
import { Data } from "./GameClient";
import { v4 as uuidv4 } from "uuid";
import { merge } from "lodash";
import { Server } from "http";

type MessageEvents = Record<string, "player" | "others">;

export class GameServer {
  private index: number = 0;
  private wss: WebSocketServer;
  private players: Record<string, WebSocket>;
  private playerData: Record<string, Data>;

  constructor(server: Server) {
    this.wss = new WebSocketServer({ server, path: "/game" });
    this.players = {};
    this.playerData = {};
  }

  public listen(messages: MessageEvents) {
    console.log("[WS] Waiting for connections...");
    this.wss.on("connection", (ws) => {
      const id = (this.index++).toString();
      this.players[id] = ws;
      this.playerData[id] = {};
      console.log(
        `[${id}]: Connected (${Object.keys(this.players).length} players)`
      );
      this.sendToPlayer(id, "_connected", {
        id,
        playersData: this.playerData,
      });

      ws.on("message", (message) => {
        const raw = message.toString();
        const data = JSON.parse(raw);
        const { _t: type, _p: payload, _d: playerData } = data;
        this.playerData[id] = merge(this.playerData[id], playerData);
        if (type in messages) {
          const events = {
            player: () => this.sendToPlayer(id, type, payload),
            others: () => this.sendToOthers(id, type, payload),
          };
          events[messages[type]]();
        } else {
          console.error("Unknown message type:", type);
        }
        console.log(`[${id}]: ${raw}`);
      });
      ws.on("close", () => {
        delete this.players[id];
        delete this.playerData[id];
        console.log(
          `[${id}]: Disconnected (${Object.keys(this.players).length} players)`
        );
        this.sendToOthers(id, "_disconnected", { id });
      });
      ws.on("error", (error) => {
        console.error(`${id}:`, error);
      });
    });
  }

  public sendToPlayer(id: string, type: string, payload: Data) {
    const player = this.players[id];
    if (!player) {
      console.error("Socket not found:", id);
      return;
    }
    player.send(JSON.stringify({ _t: type, _p: payload }));
  }

  public sendToOthers(id: string, type: string, payload: Data) {
    Object.keys(this.players)
      .filter((playerId) => playerId !== id)
      .forEach((playerId) => this.sendToPlayer(playerId, type, payload));
  }
}
