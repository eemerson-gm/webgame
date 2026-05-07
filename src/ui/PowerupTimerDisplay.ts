import * as ex from "excalibur";
import { Resources } from "../resource";
import { toolbarSelection } from "../classes/ToolbarSelection";

const toolbarSlotZ = 0;
const powerupTimerBarHeight = 1;
const powerupTimerBarBorderSize = 1;
const powerupTimerBarOverlap = 1;
const powerupTimerBarBorderColor = ex.Color.fromHex("#1b1b1b");
const powerupTimerBarFillColor = ex.Color.fromHex("#f4d35e");

export class PowerupTimerDisplay {
  private readonly powerupTimerBarBackgroundActor: ex.Actor;
  private readonly powerupTimerBarFillActor: ex.Actor;

  constructor(private getPowerupSlotPosition: () => ex.Vector) {
    this.powerupTimerBarBackgroundActor = this.createPowerupTimerBarBackgroundActor();
    this.powerupTimerBarFillActor = this.createPowerupTimerBarFillActor();
  }

  public getActors(): ex.Actor[] {
    return [
      this.powerupTimerBarBackgroundActor,
      this.powerupTimerBarFillActor,
    ];
  }

  public sync() {
    const slotSprite = Resources.PowerupSlot.toSprite();
    const progress = toolbarSelection.powerupTimeProgress();
    const isVisible = progress > 0;
    const width = Math.max(0, Math.ceil(slotSprite.width * progress));
    const borderSize = this.powerupTimerBarBorderSize(slotSprite);
    
    this.powerupTimerBarBackgroundActor.pos = this.powerupTimerBarBorderPosition(slotSprite);
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

  private createPowerupTimerBarBackgroundActor() {
    const slotSprite = Resources.PowerupSlot.toSprite();
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
    const slotSprite = Resources.PowerupSlot.toSprite();
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

  private powerupTimerBarPosition(slotSprite: ex.Sprite) {
    return this.powerupTimerBarBorderPosition(slotSprite).add(
      ex.vec(powerupTimerBarBorderSize, powerupTimerBarBorderSize),
    );
  }

  private powerupTimerBarBorderPosition(slotSprite: ex.Sprite) {
    return this.getPowerupSlotPosition().add(
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
}
