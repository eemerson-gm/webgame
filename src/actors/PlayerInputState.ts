import * as ex from "excalibur";
import type { Data } from "../classes/GameProtocol";

const flyToggleKeys = ["Backquote"];

export class PlayerInputState {
  public keyLeft: boolean = false;
  public keyRight: boolean = false;
  public keyJump: boolean = false;
  public keyDown: boolean = false;
  private previousKeyLeft: boolean = false;
  private previousKeyRight: boolean = false;
  private previousKeyJump: boolean = false;
  private previousKeyDown: boolean = false;
  private previousIsFlying: boolean = false;

  public readKeyboard(engine: ex.Engine, isFlying: boolean) {
    const didToggleFlying = flyToggleKeys.some((key) =>
      engine.input.keyboard.wasPressed(key as ex.Keys),
    );
    const nextIsFlying = didToggleFlying ? !isFlying : isFlying;

    this.keyLeft = engine.input.keyboard.isHeld(ex.Keys.A);
    this.keyRight = engine.input.keyboard.isHeld(ex.Keys.D);
    this.keyJump =
      engine.input.keyboard.isHeld(ex.Keys.Space) ||
      (nextIsFlying && engine.input.keyboard.isHeld(ex.Keys.W));
    this.keyDown =
      engine.input.keyboard.isHeld(ex.Keys.S) ||
      engine.input.keyboard.isHeld(ex.Keys.ArrowDown);

    return {
      didToggleFlying,
      isFlying: nextIsFlying,
    };
  }

  public hasChanged(isFlying: boolean) {
    if (this.keyLeft !== this.previousKeyLeft) {
      return true;
    }
    if (this.keyRight !== this.previousKeyRight) {
      return true;
    }
    if (this.keyJump !== this.previousKeyJump) {
      return true;
    }
    if (this.keyDown !== this.previousKeyDown) {
      return true;
    }
    return isFlying !== this.previousIsFlying;
  }

  public shouldSyncPosition(isGrounded: boolean, isFlying: boolean) {
    return isGrounded || isFlying || isFlying !== this.previousIsFlying;
  }

  public payload(isFlying: boolean, movementState: Data) {
    return {
      keyLeft: this.keyLeft,
      keyRight: this.keyRight,
      keyJump: this.keyJump,
      keyDown: this.keyDown,
      isFlying,
      ...movementState,
    };
  }

  public statePatch(isFlying: boolean, shouldSyncPosition: boolean, payload: Data) {
    if (shouldSyncPosition) {
      return payload;
    }
    return {
      keyLeft: this.keyLeft,
      keyRight: this.keyRight,
      keyJump: this.keyJump,
      keyDown: this.keyDown,
      isFlying,
    };
  }

  public remember(isFlying: boolean) {
    this.previousKeyLeft = this.keyLeft;
    this.previousKeyRight = this.keyRight;
    this.previousKeyJump = this.keyJump;
    this.previousKeyDown = this.keyDown;
    this.previousIsFlying = isFlying;
  }

  public horizontalSign() {
    return Number(this.keyRight) - Number(this.keyLeft);
  }

  public flyingVerticalSign() {
    return Number(this.keyDown) - Number(this.keyJump);
  }
}
