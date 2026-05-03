import type { TerrainTileKind } from "./GameProtocol";
import {
  powerupBreakDurationMultiplierFor,
  powerupDurationMsFor,
  powerupHasBehavior,
  powerupIds,
  type PlayerPowerup,
  type PowerupBehavior,
} from "./Powerups";

export const powerupModes = powerupIds;
export const placeableBlockKinds = [
  "dirt",
  "grass",
  "lamp",
  "stone",
  "whiteWool",
] as const;

export type PowerupMode = PlayerPowerup;
export type PlaceableBlockKind = (typeof placeableBlockKinds)[number];
export type BlockPlacementMode = "creative" | "survival";
export type InventoryItem = {
  type: "block";
  kind: PlaceableBlockKind;
};
export type InventoryStack = {
  item: InventoryItem;
  count: number;
};
export type InventorySlot = InventoryStack | null;

const hotbarSlotCount = 5;

export const isPlaceableBlockKind = (
  kind: TerrainTileKind | null,
): kind is PlaceableBlockKind =>
  !!kind && placeableBlockKinds.includes(kind as PlaceableBlockKind);

const isSameInventoryItem = (a: InventoryItem, b: InventoryItem) =>
  a.type === b.type && a.kind === b.kind;

const cloneSlot = (slot: InventorySlot): InventorySlot => {
  if (!slot) {
    return null;
  }
  return {
    item: { ...slot.item },
    count: slot.count,
  };
};

const directionOffset = (direction: number) => (direction > 0 ? 1 : -1);

const filledSlotIndexes = (slots: InventorySlot[]) =>
  slots
    .map((slot, index) => (slot ? index : null))
    .filter((index): index is number => index !== null);

class ToolbarSelection {
  private selectedPowerup: PowerupMode = "none";
  private selectedPowerupTimeRemainingMs: number = 0;
  private selectedHotbarSlotIndex: number = 0;
  private inventorySlots: InventorySlot[] = Array.from(
    { length: hotbarSlotCount },
    () => null,
  );

  public powerup() {
    return this.selectedPowerup;
  }

  public setPowerup(powerup: PowerupMode) {
    this.selectedPowerup = powerup;
    this.selectedPowerupTimeRemainingMs = powerupDurationMsFor(powerup);
    return this.selectedPowerup;
  }

  public updatePowerupTimer(deltaMs: number) {
    if (this.selectedPowerup === "none") {
      return false;
    }
    this.selectedPowerupTimeRemainingMs = Math.max(
      this.selectedPowerupTimeRemainingMs - deltaMs,
      0,
    );
    if (this.selectedPowerupTimeRemainingMs > 0) {
      return false;
    }
    this.setPowerup("none");
    return true;
  }

  public powerupTimeProgress() {
    const durationMs = powerupDurationMsFor(this.selectedPowerup);
    if (durationMs <= 0) {
      return 0;
    }
    return this.selectedPowerupTimeRemainingMs / durationMs;
  }

  public selectedPowerupCan(behavior: PowerupBehavior) {
    return powerupHasBehavior(this.selectedPowerup, behavior);
  }

  public breakDurationMultiplier(powerup: PowerupMode = this.selectedPowerup) {
    return powerupBreakDurationMultiplierFor(powerup);
  }

  public selectedPlaceableBlockKind() {
    const slot = this.selectedSlot();
    return slot?.item.type === "block" ? slot.item.kind : null;
  }

  public selectedSlotIndex() {
    return this.selectedHotbarSlotIndex;
  }

  public selectedSlot() {
    return cloneSlot(this.inventorySlots[this.selectedHotbarSlotIndex] ?? null);
  }

  public hotbarSlots() {
    return this.inventorySlots.map(cloneSlot);
  }

  public blockCount(kind?: PlaceableBlockKind) {
    if (!kind) {
      return this.selectedSlot()?.count ?? 0;
    }
    return this.inventorySlots
      .filter((slot) => slot?.item.type === "block" && slot.item.kind === kind)
      .reduce((count, slot) => count + (slot?.count ?? 0), 0);
  }

  public addBlock(kind: TerrainTileKind | null, count: number = 1) {
    if (!isPlaceableBlockKind(kind)) {
      return;
    }
    this.addItem({ type: "block", kind }, count);
  }

  public addItem(item: InventoryItem, count: number = 1) {
    if (count <= 0) {
      return false;
    }
    const matchingSlotIndex = this.inventorySlots.findIndex(
      (slot) => !!slot && isSameInventoryItem(slot.item, item),
    );
    if (matchingSlotIndex >= 0) {
      const matchingSlot = this.inventorySlots[matchingSlotIndex];
      if (!matchingSlot) {
        return false;
      }
      this.inventorySlots[matchingSlotIndex] = {
        item: matchingSlot.item,
        count: matchingSlot.count + count,
      };
      return true;
    }
    const emptySlotIndex = this.inventorySlots.findIndex((slot) => !slot);
    if (emptySlotIndex < 0) {
      return false;
    }
    this.inventorySlots[emptySlotIndex] = {
      item,
      count,
    };
    if (!this.inventorySlots[this.selectedHotbarSlotIndex]) {
      this.selectedHotbarSlotIndex = emptySlotIndex;
    }
    return true;
  }

  public selectedBlockForMode(mode: BlockPlacementMode) {
    const slot = this.inventorySlots[this.selectedHotbarSlotIndex] ?? null;
    if (!slot) {
      return null;
    }
    if (slot.item.type !== "block") {
      return null;
    }
    if (mode === "creative") {
      return slot.item.kind;
    }
    if (slot.count <= 0) {
      this.inventorySlots[this.selectedHotbarSlotIndex] = null;
      return null;
    }
    const nextCount = slot.count - 1;
    this.inventorySlots[this.selectedHotbarSlotIndex] =
      nextCount > 0
        ? {
            item: slot.item,
            count: nextCount,
          }
        : null;
    if (nextCount <= 0) {
      this.selectNextFilledSlot(1);
    }
    return slot.item.kind;
  }

  public selectNextSlot(direction: number) {
    if (direction === 0) {
      return this.selectedHotbarSlotIndex;
    }
    this.selectNextFilledSlot(direction);
    return this.selectedHotbarSlotIndex;
  }

  public selectedBlockKind(): TerrainTileKind | null {
    return this.selectedPlaceableBlockKind();
  }

  private selectNextFilledSlot(direction: number) {
    const filledIndexes = filledSlotIndexes(this.inventorySlots);
    if (filledIndexes.length === 0) {
      return;
    }
    const currentFilledIndex = filledIndexes.indexOf(this.selectedHotbarSlotIndex);
    if (currentFilledIndex < 0) {
      this.selectedHotbarSlotIndex = filledIndexes[0];
      return;
    }
    const nextFilledIndex =
      (currentFilledIndex + directionOffset(direction) + filledIndexes.length) %
      filledIndexes.length;
    this.selectedHotbarSlotIndex = filledIndexes[nextFilledIndex];
  }
}

export const toolbarSelection = new ToolbarSelection();
