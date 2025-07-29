import { WebSocketServer, WebSocket } from "ws";
import { Data } from "./GameClient";
import { v4 as uuidv4 } from "uuid";
import { merge } from "lodash";

type MessageEvents = Record<string, "player" | "others">;

export class GameServer {
  private wss: WebSocketServer;
  private sockets: { id: string; ws: WebSocket }[];
  private playerData: Record<string, Data>;

  constructor() {
    this.wss = new WebSocketServer({ port: 8081 });
    this.sockets = [];
    this.playerData = {};
  }

  public listen(messages: MessageEvents) {
    this.wss.on("connection", (ws) => {
      const id = uuidv4();
      this.sockets.push({ id, ws });
      this.playerData[id] = {};
      console.log(`[${id}]: Connected (${this.sockets.length} players)`);
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
        this.sockets.splice(
          this.sockets.findIndex((s) => s.id === id),
          1
        );
        delete this.playerData[id];
        console.log(`[${id}]: Disconnected (${this.sockets.length} players)`);
        this.sendToOthers(id, "_disconnected", { id });
      });
      ws.on("error", (error) => {
        console.error(`${id}:`, error);
      });
    });
  }

  public sendToPlayer(id: string, type: string, payload: Data) {
    const player = this.sockets.find((s) => s.id === id);
    if (!player) {
      console.error("Socket not found:", id);
      return;
    }
    player.ws.send(JSON.stringify({ _t: type, _p: payload }));
  }

  public sendToOthers(id: string, type: string, payload: Data) {
    this.sockets
      .filter((player) => player.id !== id)
      .forEach((player) => this.sendToPlayer(player.id, type, payload));
  }
}
