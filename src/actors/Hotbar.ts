import * as ex from "excalibur";
import { Resources } from "../resource";
import { TILE_PX } from "../world/worldConfig";

const slotSize = TILE_PX;
const slotCount = 7;
const slotGap = -1;
const bottomInset = 8;
const itemSize = 8;
const itemInset = Math.round((slotSize - itemSize) / 2);
const hotbarWidth = slotSize * slotCount + slotGap * (slotCount - 1);
const slotIndexes = Array.from({ length: slotCount }, (_, index) => index);
const slotSpriteSize = { width: slotSize, height: slotSize };
const itemSpriteSize = { width: itemSize, height: itemSize };

const centeredSlotPosition = (viewWidth: number, viewHeight: number) =>
  ex.vec(
    Math.round((viewWidth - hotbarWidth) / 2),
    viewHeight - bottomInset - slotSize,
  );

const slotX = (slotIndex: number) => slotIndex * (slotSize + slotGap);

export class Hotbar extends ex.ScreenElement {
  constructor(viewWidth: number, viewHeight: number) {
    super({
      pos: centeredSlotPosition(viewWidth, viewHeight),
      anchor: ex.vec(0, 0),
      width: hotbarWidth,
      height: slotSize,
    });
  }

  private createSlot(slotIndex: number) {
    const slot = new ex.Actor({
      pos: ex.vec(slotX(slotIndex), 0),
      anchor: ex.vec(0, 0),
      width: slotSize,
      height: slotSize,
    });
    slot.graphics.use(
      Resources.InventorySlot.toSprite({ destSize: slotSpriteSize }),
    );
    return slot;
  }

  private createPickaxe(slotIndex: number) {
    const pickaxe = new ex.Actor({
      pos: ex.vec(slotX(slotIndex) + itemInset, itemInset),
      anchor: ex.vec(0, 0),
      width: itemSize,
      height: itemSize,
    });
    pickaxe.graphics.use(
      Resources.CopperPickaxeItem.toSprite({ destSize: itemSpriteSize }),
    );
    return pickaxe;
  }

  override onInitialize() {
    slotIndexes.forEach((slotIndex) =>
      this.addChild(this.createSlot(slotIndex)),
    );
    this.addChild(this.createPickaxe(0));
  }
}
