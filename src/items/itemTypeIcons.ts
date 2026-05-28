import * as ex from "excalibur";
import { Resources } from "../resource";
import { getItemCategory, type ItemCategory } from "./itemDefinitions";

const itemTypeIcons: Record<ItemCategory, ex.ImageSource> = {
  sword: Resources.UiItemTypeSword,
  pickaxe: Resources.UiItemTypeTool,
  hat: Resources.UiSlotHat,
  boots: Resources.UiSlotBoots,
  ring: Resources.UiSlotRing,
  material: Resources.UiItemTypeMaterial,
  consumable: Resources.UiItemTypeFood,
};

export const getItemTypeIcon = (itemId: string): ex.ImageSource => {
  const category = getItemCategory(itemId);
  if (category === undefined) {
    return Resources.UiItemTypeMaterial;
  }
  return itemTypeIcons[category];
};
