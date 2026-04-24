export type Data = Record<string, any>;
export type Message = { _t: string; _p: Data };
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
    onConnect: (id: string, playersData: Data) => void;
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
    this.playerSocket.send(
      JSON.stringify({ _t: type, _p: payload, _d: patch ?? {} }),
    );
  }

  private gameServerWebSocketUrl(): string {
    const protocol = location.protocol === "https:" ? "wss" : "ws";
    const portSuffix = location.hostname === "localhost" ? ":8080" : "";
    return `${protocol}://${location.hostname}${portSuffix}/game`;
  }

  private handlersWithLifecycle(
    onConnect: (id: string, playersData: Data) => void,
    onDisconnect: (id: string) => void,
    appHandlers: MessageEvents,
  ): MessageEvents {
    return {
      ...appHandlers,
      _connected: (data: Data) => {
        const { id, playersData } = data;
        this.clientId = id;
        onConnect(id, playersData);
      },
      _disconnected: (data: Data) => {
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
    const message = JSON.parse(wsEvent.data as string) as Message;
    console.log("Received:", message);
    const type = message._t;
    const payload = message._p;
    if (!(type in handlers)) {
      console.error("Unknown event:", type);
      return;
    }
    handlers[type](payload);
  }
}
