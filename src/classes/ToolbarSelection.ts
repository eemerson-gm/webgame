import type { TerrainTileKind } from "./GameProtocol";

export const toolbarModes = ["build", "combat"] as const;
export const placeableBlockKinds = ["dirt", "grass", "lamp", "stone"] as const;

export type ToolbarMode = (typeof toolbarModes)[number];
export type PlaceableBlockKind = (typeof placeableBlockKinds)[number];

class ToolbarSelection {
  private selectedMode: ToolbarMode = "build";
  private selectedPlaceableKind: PlaceableBlockKind = "dirt";

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

  public selectedPlaceableBlockKind() {
    return this.selectedPlaceableKind;
  }

  public nextPlaceableBlockKinds(count: number) {
    const currentIndex = placeableBlockKinds.indexOf(this.selectedPlaceableKind);
    return Array.from({ length: count }, (_value, index) => {
      const nextIndex = (currentIndex + index + 1) % placeableBlockKinds.length;
      return placeableBlockKinds[nextIndex];
    });
  }

  public selectNextBlock(direction: number) {
    if (direction === 0) {
      return this.selectedPlaceableKind;
    }
    const currentIndex = placeableBlockKinds.indexOf(this.selectedPlaceableKind);
    const offset = direction > 0 ? 1 : -1;
    const nextIndex =
      (currentIndex + offset + placeableBlockKinds.length) %
      placeableBlockKinds.length;
    this.selectedPlaceableKind = placeableBlockKinds[nextIndex];
    return this.selectedPlaceableKind;
  }

  public selectedBlockKind(): TerrainTileKind | null {
    if (this.isBuildMode()) {
      return this.selectedPlaceableKind;
    }
    return null;
  }
}

export const toolbarSelection = new ToolbarSelection();
