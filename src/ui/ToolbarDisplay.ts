import * as ex from "excalibur";
import { Resources } from "../resource";
import {
  type InventorySlot,
  toolbarSelection,
} from "../classes/ToolbarSelection";
import { BlockDisplay, blockDisplaySize } from "../actors/BlockDisplay";
import { blockItemResourceForKind } from "../classes/BlockItemSprites";
import { powerupToolbarIconFor, powerupSlotColorFor } from "../classes/Powerups";
import { BlockCountDisplay } from "./BlockCountDisplay";
import type { PlayerPowerup } from "../classes/GameProtocol";

const toolbarSlotZ = 0;
const toolbarItemZOffset = 1;
const toolbarIconZOffset = 2;
const toolbarCountZOffset = 3;
const toolbarIconSlotGap = 2;
const powerupSlotGap = 3;
const hotbarPreviewGap = 2;
const blockCountMarginX = 6;
const blockCountMarginY = 3;

type ToolbarSlotView = {
  slot: ex.Actor;
  blockItem: BlockDisplay;
  spriteItem: ex.Actor;
  count: BlockCountDisplay;
  previewBlockItems: BlockDisplay[];
  previewSpriteItems: ex.Actor[];
  previewCounts: BlockCountDisplay[];
};

type HealthProvider = () => {
  health: number;
  maxHealth: number;
  isFlying: boolean;
} | null;

const powerupItemResourceByPowerup = {
  miner: Resources.MinerPowerupItem,
} satisfies Partial<Record<PlayerPowerup, ex.ImageSource>>;

const blockResourceForSlot = (slot: InventorySlot) => {
  if (!slot) {
    return null;
  }
  if (slot.item.type === "block") {
    return blockItemResourceForKind(slot.item.kind);
  }
  return null;
};

const powerupResourceForSlot = (slot: InventorySlot) => {
  if (!slot) {
    return null;
  }
  if (slot.item.type !== "powerup") {
    return null;
  }
  return powerupItemResourceByPowerup[slot.item.powerup];
};

const blockPlacementModeFor = (
  playerStatus: ReturnType<HealthProvider>,
): "creative" | "survival" =>
  playerStatus?.isFlying ? "creative" : "survival";

const blockCountTextFor = (
  slot: InventorySlot,
  playerStatus: ReturnType<HealthProvider>,
) => {
  if (!slot) {
    return "";
  }
  if (
    slot.item.type === "block" &&
    blockPlacementModeFor(playerStatus) === "creative"
  ) {
    return "∞";
  }
  return String(slot.count);
};

export class ToolbarDisplay {
  private readonly buildSlotView: ToolbarSlotView;
  private readonly powerupIconActor: ex.Actor;
  private readonly powerupSlotActor: ex.Actor;
  
  constructor(private pos: ex.Vector, private viewHeight: ex.Vector, private getHealth: HealthProvider) {
    const displayPosition = pos;
    const inventorySlotScreenMargin = 8;
    const buildSlotPosition = ex.vec(
      displayPosition.x,
      viewHeight.y -
        displayPosition.y -
        inventorySlotScreenMargin -
        Resources.InventoryBlockSlot.toSprite().height,
    );

    this.buildSlotView = this.createToolbarSlotView(buildSlotPosition);
    this.powerupIconActor = this.createPowerupIconActor(
      Resources.InventoryBlockSlot.toSprite(),
      buildSlotPosition,
      displayPosition.y,
      viewHeight.y,
      inventorySlotScreenMargin
    );
    this.powerupSlotActor = this.createPowerupSlotActor(this.powerupIconActor.pos);
  }

  public getActors(): ex.Actor[] {
    return [
      this.buildSlotView.slot,
      this.buildSlotView.blockItem,
      this.buildSlotView.spriteItem,
      this.buildSlotView.count,
      ...this.buildSlotView.previewBlockItems,
      ...this.buildSlotView.previewSpriteItems,
      ...this.buildSlotView.previewCounts,
      this.powerupIconActor,
      this.powerupSlotActor,
    ];
  }

  public sync() {
    const slots = toolbarSelection.hotbarSlots();
    const selectedIndex = toolbarSelection.selectedSlotIndex();
    const playerStatus = this.getHealth();
    const selectedSlot = slots[selectedIndex] ?? null;
    const previewSlots = this.previewSlotsFor(slots, selectedIndex);
    this.syncBuildSlotView(this.buildSlotView, selectedSlot, playerStatus);
    this.buildSlotView.previewBlockItems.forEach((preview, index) =>
      this.syncPreviewSlotView(
        preview,
        this.buildSlotView.previewSpriteItems[index],
        this.buildSlotView.previewCounts[index],
        previewSlots[index] ?? null,
        playerStatus,
      ),
    );
    this.syncPowerupIcon();
  }

  private createToolbarSlotView(slotPosition: ex.Vector): ToolbarSlotView {
    const slotSprite = Resources.InventoryBlockSlot.toSprite();
    const blockItem = this.itemActorForBuildSlot(slotSprite, slotPosition);
    const spriteItem = this.spriteItemActorForBuildSlot(slotSprite, slotPosition);
    const count = this.countActorForBuildSlot(slotSprite, slotPosition);
    const previewBlockItems = this.previewItemActorsForBuildSlot(slotSprite, slotPosition);
    const previewSpriteItems = this.previewSpriteItemActorsForBuildSlot(slotSprite, slotPosition);
    const previewCounts = this.previewCountActorsForBuildSlot(previewBlockItems);
    
    const slot = new ex.Actor({
      pos: slotPosition,
      anchor: ex.vec(0, 0),
      width: slotSprite.width,
      height: slotSprite.height,
      z: toolbarSlotZ,
    });
    blockItem.z = toolbarSlotZ + toolbarItemZOffset;
    spriteItem.z = toolbarSlotZ + toolbarItemZOffset;
    count.z = toolbarSlotZ + toolbarCountZOffset;
    previewBlockItems.forEach((preview) => {
      preview.z = toolbarSlotZ + toolbarItemZOffset;
    });
    previewSpriteItems.forEach((preview) => {
      preview.z = toolbarSlotZ + toolbarItemZOffset;
    });
    previewCounts.forEach((previewCount) => {
      previewCount.z = toolbarSlotZ + toolbarCountZOffset;
    });
    slot.graphics.anchor = ex.vec(0, 0);
    slot.graphics.use(slotSprite);
    return {
      slot,
      blockItem,
      spriteItem,
      count,
      previewBlockItems,
      previewSpriteItems,
      previewCounts,
    };
  }

  private itemActorForBuildSlot(slotSprite: ex.Sprite, slotPosition: ex.Vector) {
    const item = new BlockDisplay(
      blockItemResourceForKind("dirt"),
      slotPosition.add(this.itemOffsetForSlot(slotSprite)),
    );
    item.setDisplayVisible(false);
    return item;
  }

  private spriteItemActorForBuildSlot(slotSprite: ex.Sprite, slotPosition: ex.Vector) {
    const item = new ex.Actor({
      pos: slotPosition.add(this.itemOffsetForSlot(slotSprite)),
      anchor: ex.vec(0, 0),
      width: blockDisplaySize,
      height: blockDisplaySize,
    });
    item.graphics.anchor = ex.vec(0, 0);
    item.graphics.visible = false;
    item.graphics.opacity = 0;
    return item;
  }

  private countActorForBuildSlot(slotSprite: ex.Sprite, slotPosition: ex.Vector) {
    const count = new BlockCountDisplay(
      "",
      slotPosition.add(
        this.itemOffsetForSlot(slotSprite).add(
          ex.vec(
            blockDisplaySize - blockCountMarginX,
            blockDisplaySize - blockCountMarginY,
          ),
        ),
      ),
    );
    count.graphics.visible = false;
    return count;
  }

  private previewItemActorsForBuildSlot(slotSprite: ex.Sprite, slotPosition: ex.Vector) {
    return toolbarSelection.hotbarSlots().slice(1).map((_slot, index) => {
      const preview = new BlockDisplay(
        blockItemResourceForKind("dirt"),
        slotPosition.add(this.previewItemOffsetForSlot(slotSprite, index)),
      );
      preview.setDisplayVisible(false);
      return preview;
    });
  }

  private previewSpriteItemActorsForBuildSlot(slotSprite: ex.Sprite, slotPosition: ex.Vector) {
    return toolbarSelection.hotbarSlots().slice(1).map((_slot, index) => {
      const preview = new ex.Actor({
        pos: slotPosition.add(this.previewItemOffsetForSlot(slotSprite, index)),
        anchor: ex.vec(0, 0),
        width: blockDisplaySize,
        height: blockDisplaySize,
      });
      preview.graphics.anchor = ex.vec(0, 0);
      preview.graphics.visible = false;
      preview.graphics.opacity = 0;
      return preview;
    });
  }

  private previewCountActorsForBuildSlot(previewItems: BlockDisplay[]) {
    return previewItems.map((preview) => {
      const count = new BlockCountDisplay(
        "",
        preview.pos.add(
          ex.vec(
            blockDisplaySize - blockCountMarginX,
            blockDisplaySize - blockCountMarginY,
          ),
        ),
      );
      count.graphics.visible = false;
      return count;
    });
  }

  private itemOffsetForSlot(slotSprite: ex.Sprite) {
    return ex.vec(
      Math.floor((slotSprite.width - blockDisplaySize) / 2),
      Math.floor((slotSprite.height - blockDisplaySize) / 2),
    );
  }

  private previewItemOffsetForSlot(slotSprite: ex.Sprite, index: number) {
    return ex.vec(
      slotSprite.width +
        hotbarPreviewGap +
        index * (blockDisplaySize + hotbarPreviewGap),
      Math.floor((slotSprite.height - blockDisplaySize) / 2),
    );
  }

  private syncBuildSlotView(
    view: ToolbarSlotView,
    slot: InventorySlot,
    playerStatus: ReturnType<HealthProvider>,
  ) {
    const blockResource = blockResourceForSlot(slot);
    const powerupResource = powerupResourceForSlot(slot);
    const isItemVisible = !!blockResource || !!powerupResource;
    const shouldShowCount = isItemVisible;
    view.slot.graphics.opacity = 1;
    view.blockItem.setDisplayVisible(!!blockResource);
    view.blockItem.setDisplayOpacity(1);
    view.spriteItem.graphics.visible = !!powerupResource;
    view.spriteItem.graphics.opacity = powerupResource ? 1 : 0;
    if (blockResource) {
      view.blockItem.setImage(blockResource);
    }
    if (powerupResource) {
      view.spriteItem.graphics.use(powerupResource.toSprite());
    }
    view.count.graphics.visible = shouldShowCount;
    view.count.graphics.opacity = 1;
    if (shouldShowCount) {
      view.count.setText(blockCountTextFor(slot, playerStatus));
    }
  }

  private syncPreviewSlotView(
    blockPreview: BlockDisplay,
    spritePreview: ex.Actor,
    count: BlockCountDisplay,
    slot: InventorySlot,
    playerStatus: ReturnType<HealthProvider>,
  ) {
    const blockResource = blockResourceForSlot(slot);
    const powerupResource = powerupResourceForSlot(slot);
    const isItemVisible = !!blockResource || !!powerupResource;
    blockPreview.setDisplayVisible(!!blockResource);
    blockPreview.setDisplayOpacity(1);
    spritePreview.graphics.visible = !!powerupResource;
    spritePreview.graphics.opacity = powerupResource ? 1 : 0;
    count.graphics.visible = isItemVisible;
    count.graphics.opacity = 1;
    if (blockResource) {
      blockPreview.setImage(blockResource);
    }
    if (powerupResource) {
      spritePreview.graphics.use(powerupResource.toSprite());
    }
    if (isItemVisible) {
      count.setText(blockCountTextFor(slot, playerStatus));
    }
  }

  private previewSlotsFor(slots: InventorySlot[], selectedIndex: number) {
    return Array.from({ length: Math.max(slots.length - 1, 0) }, (_value, index) => {
      const slotIndex = (selectedIndex + index + 1) % slots.length;
      return slots[slotIndex] ?? null;
    }).filter((slot) => !!slot);
  }

  private createPowerupIconActor(
    slotSprite: ex.Sprite,
    slotPosition: ex.Vector,
    displayY: number,
    viewHeight: number,
    margin: number
  ) {
    const iconSprite = this.powerupIconSprite();
    const iconOffset = ex.vec(
      Math.floor((slotSprite.width - iconSprite.width) / 2),
      -iconSprite.height - toolbarIconSlotGap,
    );
    const calculatedPos = ex
      .vec(
        slotPosition.x,
        viewHeight -
          displayY -
          margin -
          Resources.InventoryBlockSlot.toSprite().height -
          powerupSlotGap,
      )
      .add(iconOffset);

    const icon = new ex.Actor({
      pos: calculatedPos,
      anchor: ex.vec(0, 0),
      width: iconSprite.width,
      height: iconSprite.height,
    });
    icon.z = toolbarSlotZ + toolbarIconZOffset;
    icon.graphics.anchor = ex.vec(0, 0);
    icon.graphics.use(iconSprite);
    return icon;
  }

  private createPowerupSlotActor(iconPos: ex.Vector) {
    const slotSprite = this.powerupSlotSprite();
    const iconSprite = this.powerupIconSprite();
    const slotPosition = iconPos.sub(
      ex.vec(
        Math.floor((slotSprite.width - iconSprite.width) / 2),
        Math.floor((slotSprite.height - iconSprite.height) / 2),
      ),
    );

    const slot = new ex.Actor({
      pos: slotPosition,
      anchor: ex.vec(0, 0),
      width: slotSprite.width,
      height: slotSprite.height,
      z: toolbarSlotZ - 1,
    });
    slot.graphics.anchor = ex.vec(0, 0);
    slot.graphics.use(slotSprite);
    return slot;
  }

  private powerupSlotSprite() {
    const slotSprite = Resources.PowerupSlot.toSprite();
    slotSprite.tint = powerupSlotColorFor(toolbarSelection.powerup());
    return slotSprite;
  }

  private powerupIconSprite() {
    return powerupToolbarIconFor(toolbarSelection.powerup());
  }

  private syncPowerupIcon() {
    const iconSprite = this.powerupIconSprite();
    const slotSprite = this.powerupSlotSprite();
    
    const iconOffset = ex.vec(
      Math.floor((Resources.InventoryBlockSlot.toSprite().width - iconSprite.width) / 2),
      -iconSprite.height - toolbarIconSlotGap,
    );
    const slotPosition = this.buildSlotView.slot.pos;
    const inventorySlotScreenMargin = 8;
    const displayPositionY = this.pos.y;
    const viewHeightY = this.viewHeight.y;

    this.powerupIconActor.pos = ex
      .vec(
        slotPosition.x,
        viewHeightY -
          displayPositionY -
          inventorySlotScreenMargin -
          Resources.InventoryBlockSlot.toSprite().height -
          powerupSlotGap,
      )
      .add(iconOffset);

    this.powerupIconActor.graphics.use(iconSprite);
    
    this.powerupSlotActor.pos = this.powerupIconActor.pos.sub(
      ex.vec(
        Math.floor((slotSprite.width - iconSprite.width) / 2),
        Math.floor((slotSprite.height - iconSprite.height) / 2),
      ),
    );
    this.powerupSlotActor.graphics.use(slotSprite);
  }

  public getPowerupSlotPosition(): ex.Vector {
    return this.powerupSlotActor.pos;
  }
}
