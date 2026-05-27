import * as ex from "excalibur";
import { backpackSize } from "../inventory/PlayerInventory";
import type { Player } from "../actors/Player";
import {
  allEquipmentSlots,
  getItemCategory,
  getItemDefinition,
  isEquipCategory,
  type EquipmentSlot,
} from "../items/itemDefinitions";
import { getItemIcon } from "../items/itemIcons";
import { Resources } from "../resource";
import { PixelTextDisplay, pixelTextSize } from "./PixelTextDisplay";
import { UIPanel } from "./UIPanel";

type PlayerProvider = () => Player | null;

const hudOrigin = ex.vec(4, 22);
const panelPaddingX = 6;
const panelPaddingY = 6;
const rowIconSize = 8;
const rowLabelGap = 6;
const rowLabelMinCharacters = 16;
const rowLabelColumnWidth = pixelTextSize("", rowLabelMinCharacters).width;
const rowLabelY = 2;
const inventoryToggleKey = ex.Keys.I;

const itemRowContentWidth =
  rowIconSize + rowLabelGap + rowLabelColumnWidth;

const backpackWidth = panelPaddingX + itemRowContentWidth + panelPaddingX;
const equipColumnWidth = backpackWidth;

const rowContentHeight = 9;
const slotVerticalGap = 3;
const backpackRowHeight = rowContentHeight + slotVerticalGap;
const backpackRowCount = backpackSize;
const backpackHeight = backpackRowCount * backpackRowHeight + panelPaddingY * 2;
const equipColumnGap = 8;
const equipSlotHeight = backpackRowHeight;
const equipSlotCount = allEquipmentSlots.length;
const equipColumnHeight = equipSlotCount * equipSlotHeight + panelPaddingY * 2;

const slotChromeByEquipmentSlot: Record<EquipmentSlot, ex.ImageSource> = {
  handLeft: Resources.UiIconSlotHand,
  handRight: Resources.UiIconSlotHand,
  boots: Resources.UiIconSlotBoots,
  head: Resources.UiIconSlotHead,
  ring: Resources.UiIconSlotRing,
};

const truncateDisplayName = (name: string) =>
  name.length <= rowLabelMinCharacters
    ? name
    : name.slice(0, rowLabelMinCharacters);

class InventoryIconActor extends ex.Actor {
  constructor(
    pos: ex.Vector,
    width: number,
    height: number,
    image: ex.ImageSource,
  ) {
    super({
      pos,
      anchor: ex.vec(0, 0),
      width,
      height,
    });
    this.graphics.use(image.toSprite());
    this.graphics.anchor = ex.vec(0, 0);
  }

  public setImage(image: ex.ImageSource) {
    this.graphics.use(image.toSprite());
  }
}

const rowLabelX = (iconColumnWidth: number) => iconColumnWidth + rowLabelGap;

const applyItemIcon = (
  icon: InventoryIconActor,
  itemId: string | null,
  emptyIcon: ex.ImageSource,
) => {
  if (itemId === null) {
    icon.setImage(emptyIcon);
    return;
  }
  icon.setImage(getItemIcon(itemId));
};

const applyItemLabel = (label: PixelTextDisplay, itemId: string | null) => {
  if (itemId === null) {
    label.graphics.opacity = 0;
    return;
  }
  const definition = getItemDefinition(itemId);
  if (definition === undefined) {
    label.graphics.opacity = 0;
    return;
  }
  label.setText(truncateDisplayName(definition.displayName));
  label.graphics.opacity = 1;
};

class InventoryBackpackRow extends ex.Actor {
  private readonly iconActor: InventoryIconActor;

  private readonly labelActor: PixelTextDisplay;

  private readonly backpackIndex: number;

  private readonly onActivate: (backpackIndex: number) => void;

  constructor(
    backpackIndex: number,
    rowTop: number,
    onActivate: (backpackIndex: number) => void,
  ) {
    super({
      pos: ex.vec(panelPaddingX, rowTop),
      anchor: ex.vec(0, 0),
      width: backpackWidth - panelPaddingX * 2,
      height: backpackRowHeight,
    });
    this.backpackIndex = backpackIndex;
    this.onActivate = onActivate;
    const labelX = rowLabelX(rowIconSize);
    this.iconActor = new InventoryIconActor(
      ex.vec(0, 1),
      rowIconSize,
      rowIconSize,
      Resources.UiIconSlotEmpty,
    );
    this.labelActor = new PixelTextDisplay("", ex.vec(labelX, rowLabelY), {
      minimumCharacters: rowLabelMinCharacters,
      textAlign: "left",
    });
    this.addChild(this.iconActor);
    this.addChild(this.labelActor);
    this.pointer.useGraphicsBounds = true;
    this.on("pointerup", () => this.onActivate(this.backpackIndex));
  }

  public refresh(itemId: string | null) {
    applyItemIcon(this.iconActor, itemId, Resources.UiIconSlotEmpty);
    applyItemLabel(this.labelActor, itemId);
  }
}

class InventoryEquipSlot extends ex.Actor {
  private readonly iconActor: InventoryIconActor;

  private readonly labelActor: PixelTextDisplay;

  private readonly equipmentSlot: EquipmentSlot;

  private readonly emptySlotIcon: ex.ImageSource;

  private readonly onActivate: (equipmentSlot: EquipmentSlot) => void;

  constructor(
    equipmentSlot: EquipmentSlot,
    slotTop: number,
    onActivate: (equipmentSlot: EquipmentSlot) => void,
  ) {
    super({
      pos: ex.vec(panelPaddingX, slotTop),
      anchor: ex.vec(0, 0),
      width: equipColumnWidth - panelPaddingX * 2,
      height: equipSlotHeight,
    });
    this.equipmentSlot = equipmentSlot;
    this.onActivate = onActivate;
    this.emptySlotIcon = slotChromeByEquipmentSlot[equipmentSlot];
    const labelX = rowLabelX(rowIconSize);
    this.iconActor = new InventoryIconActor(
      ex.vec(0, 1),
      rowIconSize,
      rowIconSize,
      this.emptySlotIcon,
    );
    this.labelActor = new PixelTextDisplay("", ex.vec(labelX, rowLabelY), {
      minimumCharacters: rowLabelMinCharacters,
      textAlign: "left",
    });
    this.addChild(this.iconActor);
    this.addChild(this.labelActor);
    this.pointer.useGraphicsBounds = true;
    this.on("pointerup", () => this.onActivate(this.equipmentSlot));
  }

  public refresh(itemId: string | null) {
    applyItemIcon(this.iconActor, itemId, this.emptySlotIcon);
    applyItemLabel(this.labelActor, itemId);
  }
}

export class InventoryHud extends ex.ScreenElement {
  private readonly getPlayer: PlayerProvider;

  private visible = false;

  private readonly backpackPanel: UIPanel;

  private readonly equipPanel: UIPanel;

  private readonly backpackRows: InventoryBackpackRow[];

  private readonly equipSlots: InventoryEquipSlot[];

  private pendingEquipSlot: EquipmentSlot | undefined;

  constructor(getPlayer: PlayerProvider) {
    super({
      pos: hudOrigin,
      anchor: ex.vec(0, 0),
      width: backpackWidth + equipColumnGap + equipColumnWidth,
      height: Math.max(backpackHeight, equipColumnHeight),
      z: 1500,
    });
    this.getPlayer = getPlayer;
    this.backpackPanel = new UIPanel({
      pos: ex.vec(0, 0),
      width: backpackWidth,
      height: backpackHeight,
      z: 1,
    });
    this.equipPanel = new UIPanel({
      pos: ex.vec(backpackWidth + equipColumnGap, 0),
      width: equipColumnWidth,
      height: equipColumnHeight,
      z: 1,
    });
    this.backpackRows = Array.from({ length: backpackRowCount }, (_value, index) => {
      const row = new InventoryBackpackRow(
        index,
        panelPaddingY + index * backpackRowHeight,
        (backpackIndex) =>
        this.onBackpackRowActivated(backpackIndex),
      );
      this.backpackPanel.addChild(row);
      return row;
    });
    this.equipSlots = allEquipmentSlots.map((equipmentSlot, index) => {
      const slot = new InventoryEquipSlot(
        equipmentSlot,
        panelPaddingY + index * equipSlotHeight,
        (slotId) =>
        this.onEquipSlotActivated(slotId),
      );
      this.equipPanel.addChild(slot);
      return slot;
    });
    this.addChild(this.backpackPanel);
    this.addChild(this.equipPanel);
    this.setPanelVisible(false);
  }

  override onInitialize(engine: ex.Engine) {
    engine.input.keyboard.on("press", (event: ex.KeyEvent) => {
      if (event.key !== inventoryToggleKey) {
        return;
      }
      this.visible = !this.visible;
      this.setPanelVisible(this.visible);
    });
  }

  override onPostUpdate() {
    this.refresh();
  }

  private setPanelVisible(isVisible: boolean) {
    this.graphics.opacity = isVisible ? 1 : 0;
    this.backpackPanel.graphics.opacity = isVisible ? 1 : 0;
    this.equipPanel.graphics.opacity = isVisible ? 1 : 0;
  }

  private refresh() {
    const player = this.getPlayer();
    if (player === null) {
      return;
    }
    const inventory = player.inventory;
    this.backpackRows.forEach((row, index) => {
      row.refresh(inventory.getBackpack()[index] ?? null);
    });
    this.equipSlots.forEach((slot, index) => {
      const equipmentSlot = allEquipmentSlots[index];
      slot.refresh(inventory.getEquipped(equipmentSlot));
    });
  }

  private onBackpackRowActivated(backpackIndex: number) {
    const player = this.getPlayer();
    if (player === null) {
      return;
    }
    const inventory = player.inventory;
    const itemId = inventory.getBackpack()[backpackIndex];
    if (itemId === null) {
      return;
    }
    const category = getItemCategory(itemId);
    if (category === undefined || !isEquipCategory(category)) {
      return;
    }
    const targetSlot = this.pendingEquipSlot;
    this.pendingEquipSlot = undefined;
    if (!inventory.equipFromBackpack(backpackIndex, targetSlot)) {
      return;
    }
    player.syncInventoryState();
    this.refresh();
  }

  private onEquipSlotActivated(equipmentSlot: EquipmentSlot) {
    const player = this.getPlayer();
    if (player === null) {
      return;
    }
    const inventory = player.inventory;
    if (inventory.getEquipped(equipmentSlot) !== null) {
      if (!inventory.unequip(equipmentSlot)) {
        return;
      }
      player.syncInventoryState();
      this.refresh();
      return;
    }
    this.pendingEquipSlot = equipmentSlot;
  }
}
