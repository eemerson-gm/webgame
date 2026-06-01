import { GameClient } from "../classes/GameClient";
import { messageTypes } from "../classes/GameProtocol";
import type { WorldSummary } from "../classes/GameProtocol";

export class MainMenuUI {
  private readonly mainMenuElement = () =>
    document.getElementById("main-menu");
  private readonly playerListPanelElement = () =>
    document.querySelector<HTMLElement>(".player-list");
  private readonly worldListElement = () =>
    document.getElementById("world-list");
  private readonly createWorldButtonElement = () =>
    document.getElementById("create-world") as HTMLButtonElement | null;
  private readonly mainMenuStatusElement = () =>
    document.getElementById("main-menu-status");

  public show(): void {
    this.mainMenuElement()?.removeAttribute("hidden");
    this.playerListPanelElement()?.setAttribute("hidden", "");
  }

  public hide(): void {
    this.mainMenuElement()?.setAttribute("hidden", "");
    this.playerListPanelElement()?.removeAttribute("hidden");
  }

  public setStatus(text: string): void {
    const status = this.mainMenuStatusElement();
    if (!status) {
      return;
    }
    status.textContent = text;
  }

  public setCreateWorldEnabled(isEnabled: boolean): void {
    const button = this.createWorldButtonElement();
    if (!button) {
      return;
    }
    button.disabled = !isEnabled;
  }

  public renderWorlds(worlds: WorldSummary[], client: GameClient): void {
    const list = this.worldListElement();
    if (!list) {
      return;
    }
    list.replaceChildren(
      ...worlds.map((world) => this.createWorldCard(world, client)),
    );
    this.setStatus(
      worlds.length === 0 ? "No worlds available" : "Select a world",
    );
  }

  public wireCreateWorld(client: GameClient): void {
    const button = this.createWorldButtonElement();
    if (!button) {
      return;
    }
    button.disabled = true;
    button.addEventListener("click", () => {
      this.setStatus("Creating world...");
      button.disabled = true;
      client.send(messageTypes.createWorld, {});
    });
  }

  private createJoinWorldButton(
    world: WorldSummary,
    client: GameClient,
  ): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Join";
    button.addEventListener("click", () => {
      this.setStatus(`Joining ${world.name}...`);
      client.send(messageTypes.joinWorld, { worldId: world.id });
    });
    return button;
  }

  private createWorldCard(
    world: WorldSummary,
    client: GameClient,
  ): HTMLDivElement {
    const card = document.createElement("div");
    const details = document.createElement("div");
    const name = document.createElement("div");
    const count = document.createElement("div");
    card.className = "world-card";
    name.className = "world-card__name";
    count.className = "world-card__count";
    name.textContent = world.name;
    count.textContent = `${world.playerCount} player${world.playerCount === 1 ? "" : "s"}`;
    details.replaceChildren(name, count);
    card.replaceChildren(details, this.createJoinWorldButton(world, client));
    return card;
  }
}
