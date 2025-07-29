export type Data = Record<string, any>;
export type Message = { _t: string; _p: Data };
export type Event = (data: Data) => void;
export type MessageEvents = Record<string, Event>;

export class GameClient {
  public socket: WebSocket;
  public clientId: string;

  constructor() {
    this.socket = new WebSocket("ws://localhost:8081");
    this.clientId = "";
  }

  public listen({
    listener,
    onConnect,
    onDisconnect,
  }: {
    listener: (socket: WebSocket) => MessageEvents;
    onConnect: (id: string, playersData: Data) => void;
    onDisconnect: (id: string) => void;
  }) {
    const customEvents = listener(this.socket);
    const events = {
      ...customEvents,
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
    this.socket.addEventListener("open", () => {
      console.log("Connected to server");
    });
    this.socket.addEventListener("message", (message) => {
      console.log("Received:", message.data);
      const data = JSON.parse(message.data) as Message;
      const { _t: type, _p: payload } = data;
      if (type in events) {
        events[type](payload);
      } else {
        console.error("Unknown event:", type);
      }
    });
    this.socket.addEventListener("close", () => {
      console.log("Disconnected from server");
    });
    this.socket.addEventListener("error", (error) => {
      console.error("Error:", error);
    });
  }

  public send(type: string, payload: Data, playerData?: Data) {
    this.socket.send(
      JSON.stringify({ _t: type, _p: payload, _d: playerData || {} })
    );
  }
}
