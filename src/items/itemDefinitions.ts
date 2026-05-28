import itemsJson from "../data/items/items.json";

export type ItemCategory =
  | "sword"
  | "pickaxe"
  | "hat"
  | "boots"
  | "ring"
  | "material"
  | "consumable";

export type EquipmentSlot =
  | "handLeft"
  | "handRight"
  | "boots"
  | "head"
  | "ring";

export type EquipmentSlotGroup = "hand" | "boots" | "head" | "ring";

export type HandAttackAnimation = "sword" | "pickaxe";

export type ItemDefinition = {
  id: string;
  category: ItemCategory;
  displayName: string;
};

type ItemJsonRow = {
  category: ItemCategory;
  displayName: string;
};

type CategoryConfig = {
  slotGroup: EquipmentSlotGroup | null;
  handAttackAnimation: HandAttackAnimation | null;
};

const categoryConfigs: Record<ItemCategory, CategoryConfig> = {
  sword: {
    slotGroup: "hand",
    handAttackAnimation: "sword",
  },
  pickaxe: {
    slotGroup: "hand",
    handAttackAnimation: "pickaxe",
  },
  hat: {
    slotGroup: "head",
    handAttackAnimation: null,
  },
  boots: {
    slotGroup: "boots",
    handAttackAnimation: null,
  },
  ring: {
    slotGroup: "ring",
    handAttackAnimation: null,
  },
  material: {
    slotGroup: null,
    handAttackAnimation: null,
  },
  consumable: {
    slotGroup: null,
    handAttackAnimation: null,
  },
};

const equipmentSlotForGroup: Record<EquipmentSlotGroup, EquipmentSlot> = {
  hand: "handLeft",
  boots: "boots",
  head: "head",
  ring: "ring",
};

const itemRows = itemsJson as Record<string, ItemJsonRow>;

const itemDefinitions: Record<string, ItemDefinition> = Object.fromEntries(
  Object.entries(itemRows).map(([id, row]) => [
    id,
    {
      id,
      category: row.category,
      displayName: row.displayName,
    },
  ]),
);

export const getItemDefinition = (itemId: string): ItemDefinition | undefined =>
  itemDefinitions[itemId];

export const getItemCategory = (itemId: string): ItemCategory | undefined =>
  getItemDefinition(itemId)?.category;

export const getHandAttackAnimation = (
  category: ItemCategory,
): HandAttackAnimation | null => categoryConfigs[category].handAttackAnimation;

export const isHandCategory = (category: ItemCategory): boolean =>
  categoryConfigs[category].handAttackAnimation !== null;

export const isEquipCategory = (category: ItemCategory): boolean =>
  categoryConfigs[category].slotGroup !== null;

const handEquipmentSlots: EquipmentSlot[] = ["handLeft", "handRight"];

export const equipmentSlotsForCategory = (
  category: ItemCategory,
): EquipmentSlot[] => {
  const slotGroup = categoryConfigs[category].slotGroup;
  if (slotGroup === null) {
    return [];
  }
  if (slotGroup === "hand") {
    return handEquipmentSlots;
  }
  return [equipmentSlotForGroup[slotGroup]];
};

export const canEquipToSlot = (
  itemId: string,
  equipmentSlot: EquipmentSlot,
): boolean => {
  const category = getItemCategory(itemId);
  if (category === undefined) {
    return false;
  }
  return equipmentSlotsForCategory(category).includes(equipmentSlot);
};

export const defaultEquipmentSlotForItem = (
  itemId: string,
): EquipmentSlot | undefined => {
  const category = getItemCategory(itemId);
  if (category === undefined) {
    return undefined;
  }
  const slots = equipmentSlotsForCategory(category);
  return slots[0];
};

export const allEquipmentSlots: EquipmentSlot[] = [
  "handLeft",
  "handRight",
  "boots",
  "head",
  "ring",
];
