import type { TerrainTileKind } from "./GameProtocol";

export const powerupModes = ["none", "miner"] as const;
export const placeableBlockKinds = [
  "dirt",
  "grass",
  "lamp",
  "stone",
  "whiteWool",
] as const;

export type PowerupMode = (typeof powerupModes)[number];
export type PlaceableBlockKind = (typeof placeableBlockKinds)[number];
export type BlockInventoryCounts = Record<PlaceableBlockKind, number>;
export type BlockPlacementMode = "creative" | "survival";

const startingBlockInventoryCounts = {
  dirt: 20,
  grass: 20,
  lamp: 10,
  stone: 20,
  whiteWool: 20,
} satisfies BlockInventoryCounts;

export const isPlaceableBlockKind = (
  kind: TerrainTileKind | null,
): kind is PlaceableBlockKind =>
  !!kind && placeableBlockKinds.includes(kind as PlaceableBlockKind);

class ToolbarSelection {
  private selectedPowerup: PowerupMode = "none";
  private selectedPlaceableKind: PlaceableBlockKind = "dirt";
  private blockInventoryCounts: BlockInventoryCounts = {
    ...startingBlockInventoryCounts,
  };

  public powerup() {
    return this.selectedPowerup;
  }

  public setPowerup(powerup: PowerupMode) {
    this.selectedPowerup = powerup;
    return this.selectedPowerup;
  }

  public isMinerPowerup() {
    return this.selectedPowerup === "miner";
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

  public selectedBlockForMode(mode: BlockPlacementMode) {
    if (mode === "creative") {
      return this.selectedPlaceableKind;
    }
    if (this.blockInventoryCounts[this.selectedPlaceableKind] <= 0) {
      return null;
    }
    this.blockInventoryCounts[this.selectedPlaceableKind] -= 1;
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
    return this.selectedPlaceableKind;
  }
}

export const toolbarSelection = new ToolbarSelection();
