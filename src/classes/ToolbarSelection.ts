import type { TerrainTileKind } from "./GameProtocol";

export const toolbarModes = ["build", "combat"] as const;

export type ToolbarMode = (typeof toolbarModes)[number];

class ToolbarSelection {
  private selectedMode: ToolbarMode = "build";

  public mode() {
    return this.selectedMode;
  }

  public toggleMode() {
    this.selectedMode = this.selectedMode === "build" ? "combat" : "build";
    return this.selectedMode;
  }

  public isBuildMode() {
    return this.selectedMode === "build";
  }

  public isCombatMode() {
    return this.selectedMode === "combat";
  }

  public selectedBlockKind(): TerrainTileKind | null {
    if (this.isBuildMode()) {
      return "dirt";
    }
    return null;
  }
}

export const toolbarSelection = new ToolbarSelection();
