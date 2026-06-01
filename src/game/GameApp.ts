import * as ex from "excalibur";
import { GameClient } from "../classes/GameClient";
import { messageTypes } from "../classes/GameProtocol";
import type {
  Data,
  EntityState,
  PlayerState,
  WorldsUpdatedPayload,
} from "../classes/GameProtocol";
import { wireIntegerCanvasDisplay } from "../integerCanvasDisplay";
import { Resources } from "../resource";
import { ClientWorldSession } from "./ClientWorldSession";
import { MainMenuUI } from "../ui/MainMenuUI";

const viewWidth = 320;
const viewHeight = 180;
const viewPixelRatio = 3;

const browserActionGameKeyCodes = [
  "Tab",
  "Space",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
];

export class GameApp {
  private readonly loader = new ex.DefaultLoader({
    loadables: Object.values(Resources),
  });

  private readonly engine = new ex.Engine({
    width: viewWidth,
    height: viewHeight,
    canvasElementId: "game",
    antialiasing: false,
    backgroundColor: ex.Color.fromHex("#54C0CA"),
    pixelArt: true,
    snapToPixel: false,
    pixelRatio: viewPixelRatio,
    displayMode: ex.DisplayMode.FitContainer,
  });

  private readonly menuUi = new MainMenuUI();
  private session: ClientWorldSession | null = null;

  public start(): void {
    this.engine.start(this.loader).then(() => {
      wireIntegerCanvasDisplay(this.engine, {
        viewWidth,
        viewHeight,
        pixelRatio: viewPixelRatio,
        maxDisplayWidth: 1280,
      });
      this.focusGameCanvas();
      this.menuUi.show();
      const client = new GameClient();
      this.menuUi.wireCreateWorld(client);
      this.wireGameClient(client);
    });
  }

  private focusGameCanvas(): void {
    this.engine.canvas.tabIndex = 0;
    this.engine.canvas.addEventListener("pointerdown", () =>
      this.engine.canvas.focus(),
    );
    this.engine.canvas.addEventListener("keydown", (event) => {
      if (!browserActionGameKeyCodes.includes(event.code)) {
        return;
      }
      event.preventDefault();
    });
  }

  private wireGameClient(client: GameClient): void {
    client.listen({
      onOpen: () => {
        this.menuUi.setStatus("Loading worlds...");
        this.menuUi.setCreateWorldEnabled(true);
        client.send(messageTypes.listWorlds, {});
      },
      onWorldsUpdated: (payload: WorldsUpdatedPayload) => {
        this.menuUi.setCreateWorldEnabled(true);
        this.menuUi.renderWorlds(payload.worlds, client);
      },
      onConnect: (myPlayerId, playersData, entitiesData, world) => {
        this.session = ClientWorldSession.begin(
          this.engine,
          client,
          myPlayerId,
          playersData as Record<string, PlayerState>,
          entitiesData as Record<string, EntityState>,
          world,
          { width: viewWidth, height: viewHeight },
          this.menuUi,
        );
      },
      onDisconnect: (gonePlayerId) => {
        this.session?.removeRemotePlayer(gonePlayerId);
      },
      listener: () => this.deferredMessageHandlers(),
    });
  }

  private deferredMessageHandlers(): Record<string, (payload: Data) => void> {
    const route = (type: string) => (payload: Data) => {
      const session = this.session;
      if (!session) {
        return;
      }
      const handler = session.buildMessageHandlers()[type];
      if (!handler) {
        return;
      }
      handler(payload);
    };
    return {
      [messageTypes.createPlayer]: route(messageTypes.createPlayer),
      [messageTypes.updatePlayer]: route(messageTypes.updatePlayer),
      [messageTypes.updatePing]: route(messageTypes.updatePing),
      [messageTypes.knockbackPlayer]: route(messageTypes.knockbackPlayer),
      [messageTypes.damagePlayer]: route(messageTypes.damagePlayer),
      [messageTypes.updateEntities]: route(messageTypes.updateEntities),
      [messageTypes.pong]: route(messageTypes.pong),
    };
  }
}
