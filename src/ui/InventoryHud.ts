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
import { getItemTypeIcon } from "../items/itemTypeIcons";
import { Resources } from "../resource";
import {
  OutlinedPixelTextDisplay,
  PixelTextDisplay,
  pixelTextSize,
} from "./PixelTextDisplay";
import { fillPixelRect, preparePixelCanvas, snapPixel } from "./pixelUi";
import { UIPanel, uiPanelInnerContentInset } from "./UIPanel";

type PlayerProvider = () => Player | null;

const hudOrigin = ex.vec(snapPixel(4), snapPixel(22));
const slotInsetX = 6;
const slotInsetY = 3;
const rowLabelGap = 2;
const listPaddingTop = 3;
const listPaddingBottom = 3;
const slotSeparatorThickness = 1;
const rowIconSize = 8;
const rowLabelMinCharacters = 16;
const rowLabelColumnWidth = pixelTextSize("", rowLabelMinCharacters).width;
const rowTextHeight = pixelTextSize("", rowLabelMinCharacters).height;
const slotContentHeight = rowIconSize > rowTextHeight ? rowIconSize : rowTextHeight;
const slotHeight = slotInsetY * 2 + slotContentHeight;
const slotIconY = slotInsetY + snapPixel((slotContentHeight - rowIconSize) / 2);
const slotLabelY = slotInsetY + snapPixel((slotContentHeight - rowTextHeight) / 2);
const rowLabelX = slotInsetX + rowIconSize + rowLabelGap + 1;
const inventoryToggleKey = ex.Keys.I;

const itemRowContentWidth =
  rowIconSize + rowLabelGap + rowLabelColumnWidth;

const panelWidth = slotInsetX * 2 + itemRowContentWidth;
const slotSeparatorWidth = panelWidth - uiPanelInnerContentInset * 2;
const backpackWidth = panelWidth;
const equipColumnWidth = panelWidth;

const slotBlockStride = slotHeight + slotSeparatorThickness;
const equipSlotCount = allEquipmentSlots.length;
const backpackVisibleRowCount = 8;
const backpackVisibleListHeight =
  listPaddingTop +
  listPaddingBottom +
  backpackVisibleRowCount * slotHeight +
  (backpackVisibleRowCount - 1) * slotSeparatorThickness;
const bagFillCountMinCharacters = 5;
const bagFillCountGap = 4;
const bagFillCountBottomPad = 2;
const bagFillCountHeight = pixelTextSize(
  `0/${backpackSize}`,
  bagFillCountMinCharacters,
  true,
).height;
const backpackFillCountAreaHeight =
  bagFillCountGap + bagFillCountHeight + bagFillCountBottomPad;
const backpackPanelTitleText = "BACKPACK";
const equipPanelTitleText = "EQUIPMENT";
const panelTitleGap = 3;
const panelTitleHeight = pixelTextSize(
  backpackPanelTitleText,
  backpackPanelTitleText.length,
  true,
).height;
const panelHeaderHeight = panelTitleGap + panelTitleHeight;
const backpackColumnHeight =
  panelHeaderHeight + backpackVisibleListHeight + backpackFillCountAreaHeight;
const equipColumnGap = 1;
const equipPanelBodyHeight =
  listPaddingTop +
  listPaddingBottom +
  equipSlotCount * slotHeight +
  (equipSlotCount - 1) * slotSeparatorThickness;
const equipColumnHeight = panelHeaderHeight + equipPanelBodyHeight;

const slotSeparatorColor = "#000000";

const slotChromeByEquipmentSlot: Record<EquipmentSlot, ex.ImageSource> = {
  handLeft: Resources.UiSlotHand,
  handRight: Resources.UiSlotHand,
  boots: Resources.UiSlotBoots,
  head: Resources.UiSlotHat,
  ring: Resources.UiSlotRing,
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

const slotTop = (index: number) => listPaddingTop + index * slotBlockStride;

const slotSeparatorY = (index: number) =>
  listPaddingTop + (index + 1) * slotHeight + index * slotSeparatorThickness;

const panelOutlinedTitle = (
  text: string,
  panelLeft: number,
  titleY: number,
) =>
  new OutlinedPixelTextDisplay(text, ex.vec(panelLeft, titleY), {
    minimumCharacters: text.length,
    textAlign: "left",
  });

class InventorySlotSeparatorsRaster extends ex.Raster {
  constructor(
    private readonly panelHeight: number,
    private readonly rowCount: number,
  ) {
    super({
      width: panelWidth,
      height: panelHeight,
      origin: ex.vec(0, 0),
      smoothing: false,
      filtering: ex.ImageFiltering.Pixel,
    });
  }

  override clone() {
    return new InventorySlotSeparatorsRaster(this.panelHeight, this.rowCount);
  }

  override execute(ctx: CanvasRenderingContext2D) {
    preparePixelCanvas(ctx);
    ctx.fillStyle = slotSeparatorColor;
    Array.from({ length: this.rowCount - 1 }, (_value, index) => {
      fillPixelRect(
        ctx,
        uiPanelInnerContentInset,
        slotSeparatorY(index),
        slotSeparatorWidth,
        1,
      );
    });
  }
}

class InventorySlotSeparatorsOverlay extends ex.Actor {
  constructor(panelHeight: number, rowCount: number) {
    super({
      pos: ex.vec(0, 0),
      anchor: ex.vec(0, 0),
      width: panelWidth,
      height: panelHeight,
    });
    this.graphics.use(new InventorySlotSeparatorsRaster(panelHeight, rowCount));
    this.graphics.anchor = ex.vec(0, 0);
  }
}

const addSlotSeparators = (
  panel: ex.ScreenElement,
  panelHeight: number,
  rowCount: number,
) => {
  panel.addChild(new InventorySlotSeparatorsOverlay(panelHeight, rowCount));
};

const applyBackpackRow = (
  icon: InventoryIconActor,
  label: PixelTextDisplay,
  itemId: string | null,
) => {
  if (itemId === null) {
    icon.graphics.opacity = 0;
    label.graphics.opacity = 0;
    return;
  }
  const definition = getItemDefinition(itemId);
  if (definition === undefined) {
    icon.graphics.opacity = 0;
    label.graphics.opacity = 0;
    return;
  }
  icon.setImage(getItemTypeIcon(itemId));
  icon.graphics.opacity = 1;
  label.setText(truncateDisplayName(definition.displayName));
  label.graphics.opacity = 1;
};

const applyEquipRow = (
  icon: InventoryIconActor,
  label: PixelTextDisplay,
  itemId: string | null,
  emptySlotIcon: ex.ImageSource,
) => {
  if (itemId === null) {
    icon.setImage(emptySlotIcon);
    icon.graphics.opacity = 1;
    label.graphics.opacity = 0;
    return;
  }
  const definition = getItemDefinition(itemId);
  if (definition === undefined) {
    icon.setImage(emptySlotIcon);
    icon.graphics.opacity = 1;
    label.graphics.opacity = 0;
    return;
  }
  icon.setImage(getItemTypeIcon(itemId));
  icon.graphics.opacity = 1;
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
      pos: ex.vec(0, rowTop),
      anchor: ex.vec(0, 0),
      width: panelWidth,
      height: slotHeight,
    });
    this.backpackIndex = backpackIndex;
    this.onActivate = onActivate;
    this.iconActor = new InventoryIconActor(
      ex.vec(slotInsetX, slotIconY),
      rowIconSize,
      rowIconSize,
      Resources.UiItemTypeMaterial,
    );
    this.labelActor = new PixelTextDisplay("", ex.vec(rowLabelX, slotLabelY), {
      minimumCharacters: rowLabelMinCharacters,
      textAlign: "left",
    });
    this.addChild(this.iconActor);
    this.addChild(this.labelActor);
    this.pointer.useGraphicsBounds = true;
    this.on("pointerup", () => this.onActivate(this.backpackIndex));
  }

  public refresh(itemId: string | null) {
    applyBackpackRow(this.iconActor, this.labelActor, itemId);
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
      pos: ex.vec(0, slotTop),
      anchor: ex.vec(0, 0),
      width: panelWidth,
      height: slotHeight,
    });
    this.equipmentSlot = equipmentSlot;
    this.onActivate = onActivate;
    this.emptySlotIcon = slotChromeByEquipmentSlot[equipmentSlot];
    this.iconActor = new InventoryIconActor(
      ex.vec(slotInsetX, slotIconY),
      rowIconSize,
      rowIconSize,
      this.emptySlotIcon,
    );
    this.labelActor = new PixelTextDisplay("", ex.vec(rowLabelX, slotLabelY), {
      minimumCharacters: rowLabelMinCharacters,
      textAlign: "left",
    });
    this.addChild(this.iconActor);
    this.addChild(this.labelActor);
    this.pointer.useGraphicsBounds = true;
    this.on("pointerup", () => this.onActivate(this.equipmentSlot));
  }

  public refresh(itemId: string | null) {
    applyEquipRow(this.iconActor, this.labelActor, itemId, this.emptySlotIcon);
  }
}

export class InventoryHud extends ex.ScreenElement {
  private readonly getPlayer: PlayerProvider;

  private visible = false;

  private readonly backpackPanel: UIPanel;

  private readonly equipPanel: UIPanel;

  private readonly backpackRows: InventoryBackpackRow[];

  private readonly equipSlots: InventoryEquipSlot[];

  private readonly backpackFillCount: OutlinedPixelTextDisplay;

  private readonly backpackPanelTitle: OutlinedPixelTextDisplay;

  private readonly equipPanelTitle: OutlinedPixelTextDisplay;

  private pendingEquipSlot: EquipmentSlot | undefined;

  constructor(getPlayer: PlayerProvider) {
    super({
      pos: hudOrigin,
      anchor: ex.vec(0, 0),
      width: backpackWidth + equipColumnGap + equipColumnWidth,
      height: Math.max(backpackColumnHeight, equipColumnHeight),
      z: 1500,
    });
    this.getPlayer = getPlayer;
    this.backpackPanelTitle = panelOutlinedTitle(backpackPanelTitleText, 0, 0);
    this.equipPanelTitle = panelOutlinedTitle(
      equipPanelTitleText,
      backpackWidth + equipColumnGap,
      0,
    );
    this.backpackPanel = new UIPanel({
      pos: ex.vec(snapPixel(0), snapPixel(panelHeaderHeight)),
      width: backpackWidth,
      height: backpackVisibleListHeight,
      z: 1,
    });
    this.backpackFillCount = new OutlinedPixelTextDisplay(
      `0/${backpackSize}`,
      ex.vec(
        0,
        panelHeaderHeight + backpackVisibleListHeight + bagFillCountGap,
      ),
      {
        minimumCharacters: bagFillCountMinCharacters,
        textAlign: "left",
      },
    );
    this.equipPanel = new UIPanel({
      pos: ex.vec(
        snapPixel(backpackWidth + equipColumnGap),
        snapPixel(panelHeaderHeight),
      ),
      width: equipColumnWidth,
      height: equipPanelBodyHeight,
      z: 1,
    });
    this.backpackRows = Array.from({ length: backpackVisibleRowCount }, (_value, index) => {
      const row = new InventoryBackpackRow(
        index,
        slotTop(index),
        (backpackIndex) =>
        this.onBackpackRowActivated(backpackIndex),
      );
      this.backpackPanel.addChild(row);
      return row;
    });
    addSlotSeparators(
      this.backpackPanel,
      backpackVisibleListHeight,
      backpackVisibleRowCount,
    );
    this.equipSlots = allEquipmentSlots.map((equipmentSlot, index) => {
      const slot = new InventoryEquipSlot(
        equipmentSlot,
        slotTop(index),
        (slotId) =>
        this.onEquipSlotActivated(slotId),
      );
      this.equipPanel.addChild(slot);
      return slot;
    });
    addSlotSeparators(this.equipPanel, equipPanelBodyHeight, equipSlotCount);
    this.addChild(this.backpackPanelTitle);
    this.addChild(this.equipPanelTitle);
    this.addChild(this.backpackPanel);
    this.addChild(this.backpackFillCount);
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
    this.backpackPanelTitle.graphics.opacity = isVisible ? 1 : 0;
    this.equipPanelTitle.graphics.opacity = isVisible ? 1 : 0;
    this.backpackPanel.graphics.opacity = isVisible ? 1 : 0;
    this.backpackFillCount.graphics.opacity = isVisible ? 1 : 0;
    this.equipPanel.graphics.opacity = isVisible ? 1 : 0;
  }

  private refresh() {
    const player = this.getPlayer();
    if (player === null) {
      return;
    }
    const inventory = player.inventory;
    const backpack = inventory.getBackpack();
    const filledCount = backpack.filter((itemId) => itemId !== null).length;
    this.backpackFillCount.setText(`${filledCount}/${backpackSize}`);
    this.backpackRows.forEach((row, index) => {
      row.refresh(backpack[index] ?? null);
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
