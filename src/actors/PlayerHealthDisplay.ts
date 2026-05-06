import * as ex from "excalibur";
import {
  type InventoryPowerup,
  type InventorySlot,
  toolbarSelection,
} from "../classes/ToolbarSelection";
import { Resources } from "../resource";
import { BlockDisplay, blockDisplaySize } from "./BlockDisplay";
import { blockItemResourceForKind } from "../classes/BlockItemSprites";
import {
  powerupSlotColorFor,
  powerupToolbarIconFor,
} from "../classes/Powerups";

type HealthProvider = () => {
  health: number;
  maxHealth: number;
  isFlying: boolean;
} | null;
type PowerupExpiredHandler = () => void;

const heartCount = 3;
const heartOverlap = 1;
const displayPosition = ex.vec(4, 4);
const viewHeight = 180;
const inventorySlotScreenMargin = 4;
const toolbarSlotZ = 0;
const toolbarItemZOffset = 1;
const toolbarIconZOffset = 2;
const toolbarCountZOffset = 3;
const toolbarIconSlotGap = 2;
const powerupSlotGap = 3;
const powerupTimerBarHeight = 1;
const powerupTimerBarBorderSize = 1;
const powerupTimerBarOverlap = 1;
const powerupTimerBarBorderColor = ex.Color.fromHex("#1b1b1b");
const powerupTimerBarFillColor = ex.Color.fromHex("#f4d35e");
const hotbarPreviewGap = 2;
const blockCountMarginX = 4;
const blockCountMarginY = 3;
const blockCountPixelSize = 1;
const blockCountDigitGap = 1;
const blockCountOutlineSize = 1;
const blockCountMinimumDigits = 2;
const blockCountDigitGlyphs = {
  "0": ["111", "101", "101", "101", "111"],
  "1": ["010", "110", "010", "010", "111"],
  "2": ["111", "001", "111", "100", "111"],
  "3": ["111", "001", "111", "001", "111"],
  "4": ["101", "101", "111", "001", "001"],
  "5": ["111", "100", "111", "001", "111"],
  "6": ["111", "100", "111", "101", "111"],
  "7": ["111", "001", "010", "010", "010"],
  "8": ["111", "101", "111", "101", "111"],
  "9": ["111", "101", "111", "001", "111"],
  "∞": ["00000", "01010", "10101", "01010", "00000"],
} satisfies Record<string, string[]>;
type BlockCountDigit = keyof typeof blockCountDigitGlyphs;
const blockCountOutlineOffsets = [
  ex.vec(-1, -1),
  ex.vec(0, -1),
  ex.vec(1, -1),
  ex.vec(-1, 0),
  ex.vec(1, 0),
  ex.vec(-1, 1),
  ex.vec(0, 1),
  ex.vec(1, 1),
];
const blockCountDigitHeight = blockCountDigitGlyphs["0"].length;
const blockCountDigitSlots = (text: string) =>
  Math.max(blockCountMinimumDigits, text.length);
const blockCountGlyphFor = (digit: string) =>
  blockCountDigitGlyphs[digit as BlockCountDigit] ?? blockCountDigitGlyphs["0"];
const blockCountDigitWidth = (digit: string) =>
  blockCountGlyphFor(digit)[0].length;
const blockCountTextContentWidth = (text: string) =>
  text
    .split("")
    .reduce(
      (width, digit) =>
        width + blockCountDigitWidth(digit) * blockCountPixelSize,
      0,
    ) +
  Math.max(text.length - 1, 0) * blockCountDigitGap * blockCountPixelSize;
const blockCountSlotContentWidth = (digits: number) =>
  digits * blockCountDigitWidth("0") * blockCountPixelSize +
  (digits - 1) * blockCountDigitGap * blockCountPixelSize;
const blockCountTextSize = (text: string) => ({
  width:
    Math.max(
      blockCountSlotContentWidth(blockCountDigitSlots(text)),
      blockCountTextContentWidth(text),
    ) +
    blockCountOutlineSize * 2,
  height:
    blockCountDigitHeight * blockCountPixelSize + blockCountOutlineSize * 2,
});

type ToolbarSlotView = {
  slot: ex.Actor;
  blockItem: BlockDisplay;
  spriteItem: ex.Actor;
  count: BlockCountDisplay;
  previewBlockItems: BlockDisplay[];
  previewSpriteItems: ex.Actor[];
  previewCounts: BlockCountDisplay[];
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

class BlockCountRaster extends ex.Raster {
  private readonly text: string;

  constructor(text: string) {
    const size = blockCountTextSize(text);
    super({
      width: size.width,
      height: size.height,
      origin: ex.vec(size.width, size.height),
      smoothing: false,
      filtering: ex.ImageFiltering.Pixel,
    });
    this.text = text;
  }

  override clone() {
    return new BlockCountRaster(this.text);
  }

  override execute(ctx: CanvasRenderingContext2D) {
    const textOffset = ex.vec(blockCountOutlineSize, blockCountOutlineSize);
    blockCountOutlineOffsets.forEach((offset) =>
      this.drawText(ctx, textOffset.add(offset), "#000000"),
    );
    this.drawText(ctx, textOffset, "#ffffff");
  }

  private drawText(
    ctx: CanvasRenderingContext2D,
    offset: ex.Vector,
    color: string,
  ) {
    ctx.fillStyle = color;
    const startX =
      blockCountTextSize(this.text).width -
      blockCountOutlineSize * 2 -
      blockCountTextContentWidth(this.text);
    this.text.split("").forEach((digit, digitIndex) => {
      const glyph = blockCountGlyphFor(digit);
      const digitX =
        startX +
        this.text
          .slice(0, digitIndex)
          .split("")
          .reduce(
            (width, previousDigit) =>
              width +
              (blockCountDigitWidth(previousDigit) + blockCountDigitGap) *
                blockCountPixelSize,
            0,
          );
      glyph.forEach((row, rowIndex) => {
        row.split("").forEach((pixel, columnIndex) => {
          if (pixel !== "1") {
            return;
          }
          ctx.fillRect(
            digitX + columnIndex * blockCountPixelSize + offset.x,
            rowIndex * blockCountPixelSize + offset.y,
            blockCountPixelSize,
            blockCountPixelSize,
          );
        });
      });
    });
  }
}

class BlockCountDisplay extends ex.Actor {
  private text: string;

  constructor(text: string, pos: ex.Vector) {
    const size = blockCountTextSize(text);
    super({
      pos,
      anchor: ex.vec(0, 0),
      width: size.width,
      height: size.height,
    });
    this.text = text;
    this.graphics.use(new BlockCountRaster(text));
  }

  public setText(text: string) {
    if (text === this.text) {
      return;
    }
    this.text = text;
    this.graphics.use(new BlockCountRaster(text));
  }
}

const powerupItemResourceByPowerup = {
  miner: Resources.MinerPowerupItem,
} satisfies Record<InventoryPowerup, ex.ImageSource>;
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

const heartSize = () => {
  const heartSprite = Resources.HeartFull.toSprite();
  return {
    width: heartSprite.width,
    height: heartSprite.height,
  };
};

export class PlayerHealthDisplay extends ex.ScreenElement {
  private readonly getHealth: HealthProvider;
  private readonly onPowerupExpired: PowerupExpiredHandler;
  private readonly heartActors: ex.Actor[];
  private readonly buildSlotView: ToolbarSlotView;
  private readonly buildSlotActors: ex.Actor[];
  private readonly powerupIconActor: ex.Actor;
  private readonly powerupSlotActor: ex.Actor;
  private readonly powerupTimerBarBackgroundActor: ex.Actor;
  private readonly powerupTimerBarFillActor: ex.Actor;
  private readonly selectBlockFromWheel = (event: WheelEvent) => {
    const direction = Math.sign(event.deltaY);
    if (direction === 0) {
      return;
    }
    event.preventDefault();
    toolbarSelection.selectNextSlot(direction);
    this.syncBuildBlockItem();
  };

  constructor(
    getHealth: HealthProvider,
    onPowerupExpired: PowerupExpiredHandler = () => {},
  ) {
    super({
      pos: displayPosition,
      anchor: ex.vec(0, 0),
      z: 1000,
    });
    this.getHealth = getHealth;
    this.onPowerupExpired = onPowerupExpired;
    const size = heartSize();
    const heartSpacing = size.width - heartOverlap;
    this.heartActors = Array.from({ length: heartCount }, (_value, index) => {
      const actor = new ex.Actor({
        pos: ex.vec(index * heartSpacing, 0),
        anchor: ex.vec(0, 0),
        width: size.width,
        height: size.height,
      });
      actor.graphics.anchor = ex.vec(0, 0);
      return actor;
    });
    const buildSlotPosition = ex.vec(
      0,
      viewHeight -
        displayPosition.y -
        inventorySlotScreenMargin -
        Resources.InventoryBlockSlot.toSprite().height,
    );
    this.buildSlotView = this.createToolbarSlotView(buildSlotPosition);
    this.powerupIconActor = this.createPowerupIconActor(
      Resources.InventoryBlockSlot.toSprite(),
      buildSlotPosition,
    );
    this.powerupSlotActor = this.createPowerupSlotActor();
    this.powerupTimerBarBackgroundActor =
      this.createPowerupTimerBarBackgroundActor();
    this.powerupTimerBarFillActor = this.createPowerupTimerBarFillActor();
    this.buildSlotActors = [
      this.buildSlotView.slot,
      this.buildSlotView.blockItem,
      this.buildSlotView.spriteItem,
      this.buildSlotView.count,
      ...this.buildSlotView.previewBlockItems,
      ...this.buildSlotView.previewSpriteItems,
      ...this.buildSlotView.previewCounts,
    ];
  }

  override onInitialize(engine: ex.Engine) {
    engine.canvas.addEventListener("wheel", this.selectBlockFromWheel, {
      passive: false,
    });
    this.heartActors.forEach((actor) => this.addChild(actor));
    this.buildSlotActors.forEach((actor) => this.addChild(actor));
    this.addChild(this.powerupIconActor);
    this.addChild(this.powerupSlotActor);
    this.addChild(this.powerupTimerBarBackgroundActor);
    this.addChild(this.powerupTimerBarFillActor);
    this.syncBuildBlockItem();
    this.syncPowerupIcon();
    this.syncPowerupTimerBar();
    this.syncHearts();
  }

  override onPostUpdate(engine: ex.Engine, delta: number) {
    if (!engine) {
      return;
    }
    if (toolbarSelection.updatePowerupTimer(delta)) {
      this.onPowerupExpired();
    }
    this.syncBuildBlockItem();
    this.syncPowerupIcon();
    this.syncPowerupTimerBar();
    this.syncHearts();
  }

  private syncHearts() {
    const health = this.getHealth();
    const currentHealth = health?.health ?? 0;
    this.heartActors.forEach((actor, index) => {
      actor.graphics.use(this.heartSpriteFor(currentHealth - index * 2));
    });
  }

  private heartSpriteFor(heartHealth: number) {
    if (heartHealth >= 2) {
      return Resources.HeartFull.toSprite();
    }
    if (heartHealth >= 1) {
      return Resources.HeartHalf.toSprite();
    }
    return Resources.HeartEmpty.toSprite();
  }

  private createToolbarSlotView(slotPosition: ex.Vector) {
    const slotSprite = this.slotSpriteForBuildSlot();
    const blockItem = this.itemActorForBuildSlot(slotSprite, slotPosition);
    const spriteItem = this.spriteItemActorForBuildSlot(slotSprite, slotPosition);
    const count = this.countActorForBuildSlot(slotSprite, slotPosition);
    const previewBlockItems = this.previewItemActorsForBuildSlot(
      slotSprite,
      slotPosition,
    );
    const previewSpriteItems = this.previewSpriteItemActorsForBuildSlot(
      slotSprite,
      slotPosition,
    );
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

  private itemActorForBuildSlot(
    slotSprite: ex.Sprite,
    slotPosition: ex.Vector,
  ) {
    const item = new BlockDisplay(
      blockItemResourceForKind("dirt"),
      slotPosition.add(this.itemOffsetForSlot(slotSprite)),
    );
    item.setDisplayVisible(false);
    return item;
  }

  private spriteItemActorForBuildSlot(
    slotSprite: ex.Sprite,
    slotPosition: ex.Vector,
  ) {
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

  private syncBuildBlockItem() {
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

  private countActorForBuildSlot(
    slotSprite: ex.Sprite,
    slotPosition: ex.Vector,
  ) {
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

  private previewItemActorsForBuildSlot(
    slotSprite: ex.Sprite,
    slotPosition: ex.Vector,
  ) {
    return toolbarSelection.hotbarSlots().slice(1).map((_slot, index) => {
      const preview = new BlockDisplay(
        blockItemResourceForKind("dirt"),
        slotPosition.add(this.previewItemOffsetForSlot(slotSprite, index)),
      );
      preview.setDisplayVisible(false);
      return preview;
    });
  }

  private previewSpriteItemActorsForBuildSlot(
    slotSprite: ex.Sprite,
    slotPosition: ex.Vector,
  ) {
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

  private createPowerupIconActor(slotSprite: ex.Sprite, slotPosition: ex.Vector) {
    const iconSprite = this.powerupIconSprite();
    const iconOffset = ex.vec(
      Math.floor((slotSprite.width - iconSprite.width) / 2),
      -iconSprite.height - toolbarIconSlotGap,
    );
    const icon = new ex.Actor({
      pos: slotPosition.add(iconOffset),
      anchor: ex.vec(0, 0),
      width: iconSprite.width,
      height: iconSprite.height,
    });
    icon.z = toolbarSlotZ + toolbarIconZOffset;
    icon.graphics.anchor = ex.vec(0, 0);
    icon.graphics.use(iconSprite);
    return icon;
  }

  private createPowerupSlotActor() {
    const slotSprite = this.powerupSlotSprite();
    const slotPosition = this.powerupSlotPosition(slotSprite);
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

  private createPowerupTimerBarBackgroundActor() {
    const slotSprite = this.powerupSlotSprite();
    const size = this.powerupTimerBarBorderSize(slotSprite);
    const bar = new ex.Actor({
      pos: this.powerupTimerBarBorderPosition(slotSprite),
      anchor: ex.vec(0, 0),
      width: size.x,
      height: size.y,
      z: toolbarSlotZ - 1,
    });
    bar.graphics.anchor = ex.vec(0, 0);
    bar.graphics.use(
      new ex.Rectangle({
        width: size.x,
        height: size.y,
        color: powerupTimerBarBorderColor,
      }),
    );
    bar.graphics.visible = false;
    bar.graphics.opacity = 0;
    return bar;
  }

  private createPowerupTimerBarFillActor() {
    const slotSprite = this.powerupSlotSprite();
    const bar = new ex.Actor({
      pos: this.powerupTimerBarPosition(slotSprite),
      anchor: ex.vec(0, 0),
      width: slotSprite.width,
      height: powerupTimerBarHeight,
      z: toolbarSlotZ,
    });
    bar.graphics.anchor = ex.vec(0, 0);
    bar.graphics.use(
      new ex.Rectangle({
        width: slotSprite.width,
        height: powerupTimerBarHeight,
        color: powerupTimerBarFillColor,
      }),
    );
    bar.graphics.visible = false;
    bar.graphics.opacity = 0;
    return bar;
  }

  private powerupSlotSprite() {
    const slotSprite = Resources.PowerupSlot.toSprite();
    slotSprite.tint = powerupSlotColorFor(toolbarSelection.powerup());
    return slotSprite;
  }

  private slotSpriteForBuildSlot() {
    return Resources.InventoryBlockSlot.toSprite();
  }

  private powerupIconPosition(slotSprite: ex.Sprite) {
    const iconSprite = this.powerupIconSprite();
    const iconOffset = ex.vec(
      Math.floor((slotSprite.width - iconSprite.width) / 2),
      -iconSprite.height - toolbarIconSlotGap,
    );
    return ex
      .vec(
        0,
        viewHeight -
          displayPosition.y -
          inventorySlotScreenMargin -
          Resources.InventoryBlockSlot.toSprite().height -
          powerupSlotGap,
      )
      .add(iconOffset);
  }

  private powerupSlotPosition(slotSprite: ex.Sprite) {
    const iconSprite = this.powerupIconSprite();
    return this.powerupIconPosition(slotSprite).sub(
      ex.vec(
        Math.floor((slotSprite.width - iconSprite.width) / 2),
        Math.floor((slotSprite.height - iconSprite.height) / 2),
      ),
    );
  }

  private powerupTimerBarPosition(slotSprite: ex.Sprite) {
    return this.powerupTimerBarBorderPosition(slotSprite).add(
      ex.vec(powerupTimerBarBorderSize, powerupTimerBarBorderSize),
    );
  }

  private powerupTimerBarBorderPosition(slotSprite: ex.Sprite) {
    return this.powerupSlotPosition(slotSprite).add(
      ex.vec(
        -powerupTimerBarBorderSize,
        slotSprite.height -
          powerupTimerBarOverlap -
          powerupTimerBarBorderSize,
      ),
    );
  }

  private powerupTimerBarBorderSize(slotSprite: ex.Sprite) {
    return ex.vec(
      slotSprite.width + powerupTimerBarBorderSize * 2,
      powerupTimerBarHeight + powerupTimerBarBorderSize * 2,
    );
  }

  private powerupIconSprite() {
    return powerupToolbarIconFor(toolbarSelection.powerup());
  }

  private syncPowerupIcon() {
    const iconSprite = this.powerupIconSprite();
    const slotSprite = this.powerupSlotSprite();
    this.powerupIconActor.pos = this.powerupIconPosition(
      slotSprite,
    );
    this.powerupIconActor.graphics.use(iconSprite);
    this.powerupSlotActor.pos = this.powerupSlotPosition(slotSprite);
    this.powerupSlotActor.graphics.use(slotSprite);
  }

  private syncPowerupTimerBar() {
    const slotSprite = this.powerupSlotSprite();
    const progress = toolbarSelection.powerupTimeProgress();
    const isVisible = progress > 0;
    const width = Math.max(0, Math.ceil(slotSprite.width * progress));
    const borderSize = this.powerupTimerBarBorderSize(slotSprite);
    this.powerupTimerBarBackgroundActor.pos =
      this.powerupTimerBarBorderPosition(slotSprite);
    this.powerupTimerBarFillActor.pos = this.powerupTimerBarPosition(slotSprite);
    this.powerupTimerBarBackgroundActor.graphics.visible = isVisible;
    this.powerupTimerBarBackgroundActor.graphics.opacity = isVisible ? 1 : 0;
    this.powerupTimerBarFillActor.graphics.visible = isVisible;
    this.powerupTimerBarFillActor.graphics.opacity = isVisible ? 1 : 0;
    this.powerupTimerBarBackgroundActor.graphics.use(
      new ex.Rectangle({
        width: borderSize.x,
        height: borderSize.y,
        color: powerupTimerBarBorderColor,
      }),
    );
    this.powerupTimerBarFillActor.graphics.use(
      new ex.Rectangle({
        width,
        height: powerupTimerBarHeight,
        color: powerupTimerBarFillColor,
      }),
    );
  }
}
