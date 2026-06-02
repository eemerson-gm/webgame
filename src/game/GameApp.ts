import * as ex from "excalibur";
import { GameClient } from "../classes/GameClient";
import { messageTypes } from "../classes/GameWire";
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
        client.send({ type: messageTypes.listWorlds, payload: {} });
      },
      onWorldsUpdated: (payload) => {
        this.menuUi.setCreateWorldEnabled(true);
        this.menuUi.renderWorlds(payload.worlds, client);
      },
      onConnect: (myPlayerId, playersData, entitiesData, world) => {
        this.session = ClientWorldSession.begin(
          this.engine,
          client,
          myPlayerId,
          playersData,
          entitiesData,
          world,
          { width: viewWidth, height: viewHeight },
          this.menuUi,
        );
      },
      onDisconnect: (gonePlayerId) => {
        this.session?.removeRemotePlayer(gonePlayerId);
      },
    });
  }
}
