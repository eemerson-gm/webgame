import {
  ConnectedPayload,
  Data,
  decodeMessage,
  encodeMessage,
  messageTypes,
} from "./GameProtocol";

export type Event = (data: Data) => void;
export type MessageEvents = Record<string, Event>;

export class GameClient {
  public playerSocket: WebSocket;
  public clientId: string;

  constructor() {
    const url = this.gameServerWebSocketUrl();
    console.log("Connecting to", url);
    this.playerSocket = new WebSocket(url);
    this.clientId = "";
  }

  public listen({
    listener,
    onConnect,
    onDisconnect,
  }: {
    listener: (playerSocket: WebSocket) => MessageEvents;
    onConnect: (
      id: string,
      playersData: Data,
      entitiesData: Data,
      world: Data,
    ) => void;
    onDisconnect: (id: string) => void;
  }) {
    const appHandlers = listener(this.playerSocket);
    const handlers = this.handlersWithLifecycle(
      onConnect,
      onDisconnect,
      appHandlers,
    );
    this.wireSocketHandlers(handlers);
  }

  public send(type: string, payload: Data, patch?: Data) {
    if (this.playerSocket.readyState !== WebSocket.OPEN) {
      return;
    }
    this.playerSocket.send(
      encodeMessage({ type, payload, statePatch: patch }),
    );
  }

  private gameServerWebSocketUrl(): string {
    const protocol = location.protocol === "https:" ? "wss" : "ws";
    const portSuffix = location.hostname === "localhost" ? ":8080" : "";
    return `${protocol}://${location.hostname}${portSuffix}/game`;
  }

  private handlersWithLifecycle(
    onConnect: (
      id: string,
      playersData: Data,
      entitiesData: Data,
      world: Data,
    ) => void,
    onDisconnect: (id: string) => void,
    appHandlers: MessageEvents,
  ): MessageEvents {
    return {
      ...appHandlers,
      [messageTypes.connected]: (data: Data) => {
        const connectedPayload = data as ConnectedPayload;
        const { id, playersData, entitiesData, world } = connectedPayload;
        this.clientId = id;
        onConnect(id, playersData, entitiesData, world);
      },
      [messageTypes.disconnected]: (data: Data) => {
        const { id } = data;
        onDisconnect(id);
      },
    } as MessageEvents;
  }

  private wireSocketHandlers(handlers: MessageEvents) {
    this.playerSocket.addEventListener("open", () => {
      console.log("Connected to server");
    });
    this.playerSocket.addEventListener("message", (wsEvent) => {
      this.dispatchInboundMessage(wsEvent, handlers);
    });
    this.playerSocket.addEventListener("close", () => {
      console.log("Disconnected from server");
    });
    this.playerSocket.addEventListener("error", (error) => {
      console.error("Error:", error);
    });
  }

  private dispatchInboundMessage(
    wsEvent: MessageEvent,
    handlers: MessageEvents,
  ) {
    const message = decodeMessage(wsEvent.data as string);
    console.log("Received:", message);
    const { type, payload } = message;
    if (!(type in handlers)) {
      console.error("Unknown event:", type);
      return;
    }
    handlers[type](payload);
  }
}
