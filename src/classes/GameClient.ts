import {
  GameWire,
  messageTypes,
  type ClientSend,
  type EntityState,
  type PlayerState,
  type ServerToClient,
  type WorldHandlers,
  type WorldTerrain,
} from "./GameWire";

type ConnectedPayload = Extract<
  ServerToClient,
  { type: typeof messageTypes.connected }
>["payload"];

type WorldsUpdatedPayload = Extract<
  ServerToClient,
  { type: typeof messageTypes.worldsUpdated }
>["payload"];

export class GameClient {
  public playerSocket: WebSocket;
  public clientId: string;
  private readonly wire = new GameWire();
  private worldHandlers: Partial<WorldHandlers> | null = null;

  constructor() {
    const url = this.gameServerWebSocketUrl();
    console.log("Connecting to", url);
    this.playerSocket = new WebSocket(url);
    this.clientId = "";
  }

  public listen({
    onConnect,
    onDisconnect,
    onWorldsUpdated,
    onOpen = () => {},
  }: {
    onConnect: (
      id: string,
      playersData: Record<string, PlayerState>,
      entitiesData: Record<string, EntityState>,
      world: WorldTerrain,
    ) => void;
    onDisconnect: (id: string) => void;
    onWorldsUpdated?: (payload: WorldsUpdatedPayload) => void;
    onOpen?: () => void;
  }): void {
    this.wireSocketHandlers(onConnect, onDisconnect, onWorldsUpdated, onOpen);
  }

  public setWorldHandlers(handlers: Partial<WorldHandlers>): void {
    this.worldHandlers = handlers;
  }

  public clearWorldHandlers(): void {
    this.worldHandlers = null;
  }

  public send(message: ClientSend): void {
    if (this.playerSocket.readyState !== WebSocket.OPEN) {
      return;
    }
    this.playerSocket.send(this.wire.encodeClient(message));
  }

  private gameServerWebSocketUrl(): string {
    const protocol = location.protocol === "https:" ? "wss" : "ws";
    const portSuffix = location.hostname === "localhost" ? ":8080" : "";
    return `${protocol}://${location.hostname}${portSuffix}/game`;
  }

  private wireSocketHandlers(
    onConnect: (
      id: string,
      playersData: Record<string, PlayerState>,
      entitiesData: Record<string, EntityState>,
      world: WorldTerrain,
    ) => void,
    onDisconnect: (id: string) => void,
    onWorldsUpdated: ((payload: WorldsUpdatedPayload) => void) | undefined,
    onOpen: () => void,
  ): void {
    this.playerSocket.addEventListener("open", () => {
      console.log("Connected to server");
      onOpen();
    });
    this.playerSocket.addEventListener("message", (wsEvent) => {
      this.dispatchInboundMessage(wsEvent.data as string, onConnect, onDisconnect, onWorldsUpdated);
    });
    this.playerSocket.addEventListener("close", () => {
      console.log("Disconnected from server");
    });
    this.playerSocket.addEventListener("error", (error) => {
      console.error("Error:", error);
    });
  }

  private dispatchInboundMessage(
    json: string,
    onConnect: (
      id: string,
      playersData: Record<string, PlayerState>,
      entitiesData: Record<string, EntityState>,
      world: WorldTerrain,
    ) => void,
    onDisconnect: (id: string) => void,
    onWorldsUpdated: ((payload: WorldsUpdatedPayload) => void) | undefined,
  ): void {
    const message = this.wire.parseServerToClient(json);
    if (!message) {
      return;
    }
    if (message.type === messageTypes.connected) {
      this.deliverConnected(message.payload, onConnect);
      return;
    }
    if (message.type === messageTypes.disconnected) {
      onDisconnect(message.payload.id);
      return;
    }
    if (message.type === messageTypes.worldsUpdated) {
      onWorldsUpdated?.(message.payload);
      return;
    }
    this.dispatchWorldMessage(message);
  }

  private deliverConnected(
    payload: ConnectedPayload,
    onConnect: (
      id: string,
      playersData: Record<string, PlayerState>,
      entitiesData: Record<string, EntityState>,
      world: WorldTerrain,
    ) => void,
  ): void {
    const { id, playersData, entitiesData, world } = payload;
    this.clientId = id;
    onConnect(id, playersData, entitiesData, world);
  }

  private dispatchWorldMessage(message: ServerToClient): void {
    const handlers = this.worldHandlers;
    if (!handlers) {
      return;
    }
    const handler = handlers[message.type];
    if (!handler) {
      console.error("Unknown event:", message.type);
      return;
    }
    (handler as (msg: ServerToClient) => void)(message);
  }
}
