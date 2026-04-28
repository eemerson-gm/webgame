import * as ex from "excalibur";
import {
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
const toolbarIconSlotGap = 2;
const buildBlockPreviewCount = 3;
const buildBlockPreviewGap = 2;

type ToolbarSlotView = {
  slot: ex.Actor;
  item: ex.Actor;
  icon: ex.Actor;
  previewItems: BlockDisplay[];
  itemOffset: ex.Vector;
  iconOffset: ex.Vector;
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

const blockItemResourceByKind = {
  dirt: Resources.Dirt,
  grass: Resources.Grass,
  lamp: Resources.Lamp,
  stone: Resources.Stone,
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
    this.syncHearts();
  }

  override onPostUpdate(engine: ex.Engine, delta: number) {
    this.updateToolbarMode(engine);
    this.tickToolbarAnimation(delta);
    this.syncBuildBlockItem();
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
    const previewItems = this.previewItemActorsForMode(mode, slotSprite, slotPosition);
    const itemOffset = item.pos.sub(slotPosition);
    const iconOffset = icon.pos.sub(slotPosition);
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
    previewItems.forEach((preview) => {
      preview.z = toolbarOutgoingZ + toolbarItemZOffset;
    });
    slot.graphics.anchor = ex.vec(0, 0);
    slot.graphics.use(slotSprite);
    return {
      slot,
      item,
      icon,
      previewItems,
      itemOffset,
      iconOffset,
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
    view.previewItems.forEach((preview, index) => {
      preview.pos = slotPosition.add(view.previewOffsets[index]);
    });
  }

  private setToolbarViewZ(view: ToolbarSlotView, z: number) {
    view.slot.z = z;
    view.item.z = z + toolbarItemZOffset;
    view.icon.z = z + toolbarIconZOffset;
    view.previewItems.forEach((preview) => {
      preview.z = z + toolbarItemZOffset;
    });
  }

  private setToolbarViewOpacity(view: ToolbarSlotView, opacity: number) {
    view.icon.graphics.opacity = opacity;
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
