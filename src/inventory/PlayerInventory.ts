import type { PlayerState } from "../classes/GameProtocol";
import {
  allEquipmentSlots,
  canEquipToSlot,
  defaultEquipmentSlotForItem,
  isEquipCategory,
  type EquipmentSlot,
  getItemCategory,
} from "../items/itemDefinitions";
import {
  backpackSize,
  type InventoryState,
} from "./inventoryState";

export type { InventoryState } from "./inventoryState";
export { backpackSize, createEmptyInventoryState } from "./inventoryState";

const emptyBackpack = (): (string | null)[] =>
  Array.from({ length: backpackSize }, () => null);

const emptyEquipment = (): Record<EquipmentSlot, string | null> => ({
  handLeft: null,
  handRight: null,
  boots: null,
  head: null,
  ring: null,
});

const equipmentSlotToStateKey: Record<
  EquipmentSlot,
  keyof Pick<
    InventoryState,
    | "equippedHandLeftId"
    | "equippedHandRightId"
    | "equippedBootsId"
    | "equippedHeadId"
    | "equippedRingId"
  >
> = {
  handLeft: "equippedHandLeftId",
  handRight: "equippedHandRightId",
  boots: "equippedBootsId",
  head: "equippedHeadId",
  ring: "equippedRingId",
};

export class PlayerInventory {
  private backpack: (string | null)[];

  private readonly equipped: Record<EquipmentSlot, string | null>;

  constructor() {
    this.backpack = emptyBackpack();
    this.equipped = emptyEquipment();
  }

  public getBackpack(): readonly (string | null)[] {
    return this.backpack;
  }

  public getEquipped(slot: EquipmentSlot): string | null {
    return this.equipped[slot];
  }

  public setFromState(state: Partial<InventoryState>) {
    if (state.backpack !== undefined) {
      this.backpack = state.backpack.slice(0, backpackSize);
      while (this.backpack.length < backpackSize) {
        this.backpack.push(null);
      }
    }
    allEquipmentSlots.forEach((slot) => {
      const key = equipmentSlotToStateKey[slot];
      const value = state[key];
      if (value !== undefined) {
        this.equipped[slot] = value;
      }
    });
  }

  public setFromPlayerState(payload: PlayerState) {
    this.setFromState({
      backpack: payload.backpack,
      equippedHandLeftId: payload.equippedHandLeftId ?? null,
      equippedHandRightId: payload.equippedHandRightId ?? null,
      equippedBootsId: payload.equippedBootsId ?? null,
      equippedHeadId: payload.equippedHeadId ?? null,
      equippedRingId: payload.equippedRingId ?? null,
    });
  }

  public toState(): InventoryState {
    return {
      backpack: this.backpack.slice(),
      equippedHandLeftId: this.equipped.handLeft,
      equippedHandRightId: this.equipped.handRight,
      equippedBootsId: this.equipped.boots,
      equippedHeadId: this.equipped.head,
      equippedRingId: this.equipped.ring,
    };
  }

  public addItem(itemId: string): boolean {
    const slotIndex = this.backpack.findIndex((slot) => slot === null);
    if (slotIndex < 0) {
      return false;
    }
    this.backpack[slotIndex] = itemId;
    return true;
  }

  public removeAt(backpackIndex: number) {
    if (backpackIndex < 0 || backpackIndex >= backpackSize) {
      return;
    }
    this.backpack[backpackIndex] = null;
  }

  public equipFromBackpack(
    backpackIndex: number,
    equipmentSlot?: EquipmentSlot,
  ): boolean {
    const itemId = this.backpack[backpackIndex];
    if (itemId === null) {
      return false;
    }
    const category = getItemCategory(itemId);
    if (category === undefined || !isEquipCategory(category)) {
      return false;
    }
    const targetSlot =
      equipmentSlot ?? this.resolveHandSlot(itemId) ?? defaultEquipmentSlotForItem(itemId);
    if (targetSlot === undefined) {
      return false;
    }
    if (!canEquipToSlot(itemId, targetSlot)) {
      return false;
    }
    const previousEquipped = this.equipped[targetSlot];
    this.equipped[targetSlot] = itemId;
    this.backpack[backpackIndex] = previousEquipped;
    return true;
  }

  public unequip(equipmentSlot: EquipmentSlot): boolean {
    const itemId = this.equipped[equipmentSlot];
    if (itemId === null) {
      return false;
    }
    const emptyIndex = this.backpack.findIndex((slot) => slot === null);
    if (emptyIndex < 0) {
      return false;
    }
    this.backpack[emptyIndex] = itemId;
    this.equipped[equipmentSlot] = null;
    return true;
  }

  public equipItemToSlot(itemId: string, equipmentSlot: EquipmentSlot): boolean {
    const emptyIndex = this.backpack.findIndex((slot) => slot === null);
    if (emptyIndex < 0) {
      return false;
    }
    this.backpack[emptyIndex] = itemId;
    return this.equipFromBackpack(emptyIndex, equipmentSlot);
  }

  private resolveHandSlot(itemId: string): EquipmentSlot | undefined {
    if (!canEquipToSlot(itemId, "handLeft")) {
      return undefined;
    }
    if (this.equipped.handLeft === null) {
      return "handLeft";
    }
    if (this.equipped.handRight === null) {
      return "handRight";
    }
    return "handLeft";
  }
}

export const createStarterInventory = (): PlayerInventory => {
  const inventory = new PlayerInventory();
  inventory.equipItemToSlot("wood_sword", "handLeft");
  inventory.equipItemToSlot("bronze_pickaxe", "handRight");
  return inventory;
};
