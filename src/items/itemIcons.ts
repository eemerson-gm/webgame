import * as ex from "excalibur";
import { Resources } from "../resource";
import { getItemIconKey, type ItemIconKey } from "./itemDefinitions";

const itemIcons: Record<ItemIconKey, ex.ImageSource> = {
  ItemIconWoodSword: Resources.ItemIconWoodSword,
  ItemIconBronzePickaxe: Resources.ItemIconBronzePickaxe,
};

export const getItemIcon = (itemId: string): ex.ImageSource => {
  const iconKey = getItemIconKey(itemId);
  if (iconKey === undefined) {
    return Resources.UiIconPlaceholder;
  }
  return itemIcons[iconKey];
};
