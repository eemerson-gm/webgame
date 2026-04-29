import type { TerrainTileKind } from "./GameProtocol";

export const toolbarModes = ["build", "combat"] as const;
export const placeableBlockKinds = ["dirt", "grass", "lamp", "stone"] as const;

export type ToolbarMode = (typeof toolbarModes)[number];
export type PlaceableBlockKind = (typeof placeableBlockKinds)[number];
export type BlockInventoryCounts = Record<PlaceableBlockKind, number>;

const startingBlockInventoryCounts = {
  dirt: 20,
  grass: 20,
  lamp: 10,
  stone: 20,
} satisfies BlockInventoryCounts;

export const isPlaceableBlockKind = (
  kind: TerrainTileKind | null,
): kind is PlaceableBlockKind =>
  !!kind && placeableBlockKinds.includes(kind as PlaceableBlockKind);

class ToolbarSelection {
  private selectedMode: ToolbarMode = "build";
  private selectedPlaceableKind: PlaceableBlockKind = "dirt";
  private blockInventoryCounts: BlockInventoryCounts = {
    ...startingBlockInventoryCounts,
  };

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

  public blockCount(kind: PlaceableBlockKind = this.selectedPlaceableKind) {
    return this.blockInventoryCounts[kind];
  }

  public addBlock(kind: TerrainTileKind | null, count: number = 1) {
    if (!isPlaceableBlockKind(kind)) {
      return;
    }
    this.blockInventoryCounts[kind] += count;
  }

  public takeSelectedBlock() {
    const kind = this.selectedBlockKind();
    if (!kind) {
      return null;
    }
    if (this.blockInventoryCounts[kind] <= 0) {
      return null;
    }
    this.blockInventoryCounts[kind] -= 1;
    return kind;
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
