import * as ex from "excalibur";
import {
  placeableBlockKinds,
  type PlaceableBlockKind,
  toolbarModes,
  toolbarSelection,
  type ToolbarMode,
} from "../classes/ToolbarSelection";
import { Resources } from "../resource";
import { BlockDisplay, blockDisplaySize } from "./BlockDisplay";

type HealthProvider = () => {
  health: number;
  maxHealth: number;
  isFlying: boolean;
} | null;

const heartCount = 3;
const heartOverlap = 1;
const displayPosition = ex.vec(4, 4);
const viewHeight = 180;
const inventorySlotScreenMargin = 4;
const toolbarAnimationDurationMs = 140;
const toolbarOutgoingZ = 0;
const toolbarIncomingZ = 3;
const toolbarItemZOffset = 1;
const toolbarIconZOffset = 2;
const toolbarCountZOffset = 3;
const toolbarIconSlotGap = 2;
const buildBlockVisibleItemCount = Math.min(10, placeableBlockKinds.length);
const buildBlockPreviewCount = buildBlockVisibleItemCount - 1;
const buildBlockPreviewGap = 2;
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
const blockCountDigitWidth = (digit: string) => blockCountDigitGlyphs[digit][0].length;
const blockCountTextContentWidth = (text: string) =>
  text.split("").reduce(
    (width, digit) => width + blockCountDigitWidth(digit) * blockCountPixelSize,
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
  height: blockCountDigitHeight * blockCountPixelSize + blockCountOutlineSize * 2,
});

type ToolbarSlotView = {
  slot: ex.Actor;
  item: ex.Actor;
  icon: ex.Actor;
  count: BlockCountDisplay | null;
  previewItems: BlockDisplay[];
  itemOffset: ex.Vector;
  iconOffset: ex.Vector;
  countOffset: ex.Vector | null;
  previewOffsets: ex.Vector[];
};
type ToolbarAnimation = {
  from: ToolbarMode;
  to: ToolbarMode;
  elapsedMs: number;
};

const lerp = (start: number, end: number, amount: number) =>
  start + (end - start) * amount;

const easeOutCubic = (amount: number) => 1 - Math.pow(1 - amount, 3);

const blockPlacementModeFor = (
  playerStatus: ReturnType<HealthProvider>,
): "creative" | "survival" => (playerStatus?.isFlying ? "creative" : "survival");

const blockCountTextFor = (playerStatus: ReturnType<HealthProvider>) => {
  if (blockPlacementModeFor(playerStatus) === "creative") {
    return "∞";
  }
  return String(toolbarSelection.blockCount());
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
      const glyph = blockCountDigitGlyphs[digit];
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

const blockItemResourceByKind = {
  dirt: Resources.Dirt,
  grass: Resources.Grass,
  lamp: Resources.Lamp,
  stone: Resources.Stone,
  whiteWool: Resources.WhiteWool,
  blackWool: Resources.BlackWool,
  blueWool: Resources.BlueWool,
  greenWool: Resources.GreenWool,
  orangeWool: Resources.OrangeWool,
  purpleWool: Resources.PurpleWool,
  redWool: Resources.RedWool,
  yellowWool: Resources.YellowWool,
} satisfies Record<PlaceableBlockKind, ex.ImageSource>;

const heartSize = () => {
  const heartSprite = Resources.HeartFull.toSprite();
  return {
    width: heartSprite.width,
    height: heartSprite.height,
  };
};

export class PlayerHealthDisplay extends ex.ScreenElement {
  private readonly getHealth: HealthProvider;
  private readonly heartActors: ex.Actor[];
  private readonly inventorySlotViews: Record<ToolbarMode, ToolbarSlotView>;
  private readonly inventorySlotActors: ex.Actor[];
  private readonly toolbarOnscreenPosition: ex.Vector;
  private readonly toolbarOffscreenPosition: ex.Vector;
  private toolbarMode: ToolbarMode = toolbarSelection.mode();
  private selectedBuildBlockKind: PlaceableBlockKind =
    toolbarSelection.selectedPlaceableBlockKind();
  private toolbarAnimation: ToolbarAnimation | null = null;
  private readonly selectBlockFromWheel = (event: WheelEvent) => {
    if (!toolbarSelection.isBuildMode()) {
      return;
    }
    const direction = Math.sign(event.deltaY);
    if (direction === 0) {
      return;
    }
    event.preventDefault();
    toolbarSelection.selectNextBlock(direction);
    this.syncBuildBlockItem();
  };

  constructor(getHealth: HealthProvider) {
    super({
      pos: displayPosition,
      anchor: ex.vec(0, 0),
      z: 1000,
    });
    this.getHealth = getHealth;
    const size = heartSize();
    const heartSpacing = size.width - heartOverlap;
    const slotSprite = Resources.InventoryBlockSlot.toSprite();
    this.toolbarOnscreenPosition = ex.vec(
      0,
      viewHeight - displayPosition.y - inventorySlotScreenMargin - slotSprite.height,
    );
    this.toolbarOffscreenPosition = ex.vec(
      -displayPosition.x - slotSprite.width,
      this.toolbarOnscreenPosition.y,
    );
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
    this.inventorySlotViews = {
      build: this.createToolbarSlotView("build", this.toolbarOnscreenPosition),
      combat: this.createToolbarSlotView("combat", this.toolbarOffscreenPosition),
    };
    this.inventorySlotActors = [
      ...Object.values(this.inventorySlotViews).map((view) => view.slot),
      ...Object.values(this.inventorySlotViews).map((view) => view.item),
      ...Object.values(this.inventorySlotViews).map((view) => view.icon),
      ...Object.values(this.inventorySlotViews)
        .map((view) => view.count)
        .filter((count): count is BlockCountDisplay => !!count),
      ...Object.values(this.inventorySlotViews).flatMap((view) => view.previewItems),
    ];
  }

  override onInitialize(engine: ex.Engine) {
    engine.canvas.addEventListener("wheel", this.selectBlockFromWheel, {
      passive: false,
    });
    this.heartActors.forEach((actor) => this.addChild(actor));
    this.inventorySlotActors.forEach((actor) => this.addChild(actor));
    this.syncToolbarMode();
    this.syncBuildBlockItem();
    this.syncBuildBlockCount();
    this.syncHearts();
  }

  override onPostUpdate(engine: ex.Engine, delta: number) {
    this.updateToolbarMode(engine);
    this.tickToolbarAnimation(delta);
    this.syncBuildBlockItem();
    this.syncBuildBlockCount();
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

  private createToolbarSlotView(mode: ToolbarMode, slotPosition: ex.Vector) {
    const slotSprite = this.slotSpriteForMode(mode);
    const item = this.itemActorForMode(mode, slotSprite, slotPosition);
    const icon = this.iconActorForMode(mode, slotSprite, slotPosition);
    const count = this.countActorForMode(mode, slotSprite, slotPosition);
    const previewItems = this.previewItemActorsForMode(mode, slotSprite, slotPosition);
    const itemOffset = item.pos.sub(slotPosition);
    const iconOffset = icon.pos.sub(slotPosition);
    const countOffset = count ? count.pos.sub(slotPosition) : null;
    const previewOffsets = previewItems.map((preview) => preview.pos.sub(slotPosition));
    const slot = new ex.Actor({
      pos: slotPosition,
      anchor: ex.vec(0, 0),
      width: slotSprite.width,
      height: slotSprite.height,
      z: toolbarOutgoingZ,
    });
    item.z = toolbarOutgoingZ + toolbarItemZOffset;
    icon.z = toolbarOutgoingZ + toolbarIconZOffset;
    if (count) {
      count.z = toolbarOutgoingZ + toolbarCountZOffset;
    }
    previewItems.forEach((preview) => {
      preview.z = toolbarOutgoingZ + toolbarItemZOffset;
    });
    slot.graphics.anchor = ex.vec(0, 0);
    slot.graphics.use(slotSprite);
    return {
      slot,
      item,
      icon,
      count,
      previewItems,
      itemOffset,
      iconOffset,
      countOffset,
      previewOffsets,
    };
  }

  private updateToolbarMode(engine: ex.Engine) {
    if (!engine.input.keyboard.wasPressed(ex.Keys.Tab)) {
      return;
    }
    if (this.toolbarAnimation) {
      return;
    }
    const currentMode = toolbarSelection.mode();
    const nextMode = toolbarSelection.toggleMode();
    this.toolbarAnimation = {
      from: currentMode,
      to: nextMode,
      elapsedMs: 0,
    };
    this.setToolbarViewZ(this.inventorySlotViews[currentMode], toolbarOutgoingZ);
    this.setToolbarViewZ(this.inventorySlotViews[nextMode], toolbarIncomingZ);
    this.toolbarMode = toolbarSelection.mode();
  }

  private syncToolbarMode() {
    toolbarModes.forEach((mode) =>
      this.setToolbarViewPosition(
        this.inventorySlotViews[mode],
        mode === this.toolbarMode
          ? this.toolbarOnscreenPosition
          : this.toolbarOffscreenPosition,
      ),
    );
  }

  private tickToolbarAnimation(delta: number) {
    const animation = this.toolbarAnimation;
    if (!animation) {
      return;
    }
    const elapsedMs = Math.min(
      animation.elapsedMs + delta,
      toolbarAnimationDurationMs,
    );
    const amount = easeOutCubic(elapsedMs / toolbarAnimationDurationMs);
    this.toolbarAnimation = {
      ...animation,
      elapsedMs,
    };
    this.setToolbarViewPosition(
      this.inventorySlotViews[animation.from],
      ex.vec(
        lerp(this.toolbarOnscreenPosition.x, this.toolbarOffscreenPosition.x, amount),
        this.toolbarOnscreenPosition.y,
      ),
    );
    this.setToolbarViewOpacity(this.inventorySlotViews[animation.from], 1 - amount);
    this.setToolbarViewPosition(
      this.inventorySlotViews[animation.to],
      ex.vec(
        lerp(this.toolbarOffscreenPosition.x, this.toolbarOnscreenPosition.x, amount),
        this.toolbarOnscreenPosition.y,
      ),
    );
    this.setToolbarViewOpacity(this.inventorySlotViews[animation.to], amount);
    if (elapsedMs < toolbarAnimationDurationMs) {
      return;
    }
    this.toolbarAnimation = null;
    this.syncToolbarMode();
    this.setToolbarViewZ(this.inventorySlotViews[animation.to], toolbarOutgoingZ);
  }

  private setToolbarViewPosition(view: ToolbarSlotView, slotPosition: ex.Vector) {
    view.slot.pos = slotPosition;
    view.item.pos = slotPosition.add(view.itemOffset);
    view.icon.pos = slotPosition.add(view.iconOffset);
    if (view.count && view.countOffset) {
      view.count.pos = slotPosition.add(view.countOffset);
    }
    view.previewItems.forEach((preview, index) => {
      preview.pos = slotPosition.add(view.previewOffsets[index]);
    });
  }

  private setToolbarViewZ(view: ToolbarSlotView, z: number) {
    view.slot.z = z;
    view.item.z = z + toolbarItemZOffset;
    view.icon.z = z + toolbarIconZOffset;
    if (view.count) {
      view.count.z = z + toolbarCountZOffset;
    }
    view.previewItems.forEach((preview) => {
      preview.z = z + toolbarItemZOffset;
    });
  }

  private setToolbarViewOpacity(view: ToolbarSlotView, opacity: number) {
    view.icon.graphics.opacity = opacity;
    if (view.count) {
      view.count.graphics.opacity = opacity;
    }
    view.previewItems.forEach((preview) => {
      preview.setDisplayOpacity(opacity);
    });
  }

  private itemActorForMode(
    mode: ToolbarMode,
    slotSprite: ex.Sprite,
    slotPosition: ex.Vector,
  ) {
    if (mode === "build") {
      const itemOffset = ex.vec(
        Math.floor((slotSprite.width - blockDisplaySize) / 2),
        Math.floor((slotSprite.height - blockDisplaySize) / 2),
      );
      return new BlockDisplay(
        blockItemResourceByKind[this.selectedBuildBlockKind],
        slotPosition.add(itemOffset),
      );
    }
    return this.weaponItemActor(slotSprite, slotPosition);
  }

  private syncBuildBlockItem() {
    const blockKind = toolbarSelection.selectedPlaceableBlockKind();
    if (blockKind === this.selectedBuildBlockKind) {
      return;
    }
    this.selectedBuildBlockKind = blockKind;
    const item = this.inventorySlotViews.build.item;
    if (item instanceof BlockDisplay) {
      item.setImage(blockItemResourceByKind[blockKind]);
    }
    const previewKinds = toolbarSelection.nextPlaceableBlockKinds(
      buildBlockPreviewCount,
    );
    this.inventorySlotViews.build.previewItems.forEach((preview, index) => {
      const previewKind = previewKinds[index];
      preview.setImage(blockItemResourceByKind[previewKind]);
    });
  }

  private syncBuildBlockCount() {
    this.inventorySlotViews.build.count?.setText(blockCountTextFor(this.getHealth()));
  }

  private weaponItemActor(slotSprite: ex.Sprite, slotPosition: ex.Vector) {
    const weaponSprite = Resources.BronzeSwordItem.toSprite();
    const weaponOffset = ex.vec(
      Math.floor((slotSprite.width - weaponSprite.width) / 2),
      Math.floor((slotSprite.height - weaponSprite.height) / 2),
    );
    const weapon = new ex.Actor({
      pos: slotPosition.add(weaponOffset),
      anchor: ex.vec(0, 0),
      width: weaponSprite.width,
      height: weaponSprite.height,
    });
    weapon.graphics.anchor = ex.vec(0, 0);
    weapon.graphics.use(weaponSprite);
    return weapon;
  }

  private countActorForMode(
    mode: ToolbarMode,
    slotSprite: ex.Sprite,
    slotPosition: ex.Vector,
  ) {
    if (mode !== "build") {
      return null;
    }
    const itemOffset = ex.vec(
      Math.floor((slotSprite.width - blockDisplaySize) / 2),
      Math.floor((slotSprite.height - blockDisplaySize) / 2),
    );
    return new BlockCountDisplay(
      blockCountTextFor(this.getHealth()),
      slotPosition.add(
        itemOffset.add(
          ex.vec(
            blockDisplaySize - blockCountMarginX,
            blockDisplaySize - blockCountMarginY,
          ),
        ),
      ),
    );
  }

  private iconActorForMode(
    mode: ToolbarMode,
    slotSprite: ex.Sprite,
    slotPosition: ex.Vector,
  ) {
    const iconSprite = this.iconSpriteForMode(mode);
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
    icon.graphics.anchor = ex.vec(0, 0);
    icon.graphics.use(iconSprite);
    icon.graphics.opacity = mode === this.toolbarMode ? 1 : 0;
    return icon;
  }

  private previewItemActorsForMode(
    mode: ToolbarMode,
    slotSprite: ex.Sprite,
    slotPosition: ex.Vector,
  ) {
    if (mode !== "build") {
      return [];
    }
    return toolbarSelection
      .nextPlaceableBlockKinds(buildBlockPreviewCount)
      .map((kind, index) => {
        const previewOffset = ex.vec(
          slotSprite.width +
            buildBlockPreviewGap +
            index * (blockDisplaySize + buildBlockPreviewGap),
          Math.floor((slotSprite.height - blockDisplaySize) / 2),
        );
        const preview = new BlockDisplay(
          blockItemResourceByKind[kind],
          slotPosition.add(previewOffset),
        );
        preview.setDisplayOpacity(mode === this.toolbarMode ? 1 : 0);
        return preview;
      });
  }

  private slotSpriteForMode(mode: ToolbarMode) {
    if (mode === "build") {
      return Resources.InventoryBlockSlot.toSprite();
    }
    return Resources.InventoryWeaponSlot.toSprite();
  }

  private iconSpriteForMode(mode: ToolbarMode) {
    if (mode === "build") {
      return Resources.BuildIcon.toSprite();
    }
    return Resources.CombatIcon.toSprite();
  }
}
