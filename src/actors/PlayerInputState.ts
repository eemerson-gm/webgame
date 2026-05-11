import * as ex from "excalibur";
import type { Data } from "../classes/GameProtocol";

export class PlayerInputState {
  public keyLeft: boolean = false;
  public keyRight: boolean = false;
  public keyJump: boolean = false;
  public keyDown: boolean = false;
  private previousKeyLeft: boolean = false;
  private previousKeyRight: boolean = false;
  private previousKeyJump: boolean = false;
  private previousKeyDown: boolean = false;

  public readKeyboard(engine: ex.Engine) {
    this.keyLeft = engine.input.keyboard.isHeld(ex.Keys.A);
    this.keyRight = engine.input.keyboard.isHeld(ex.Keys.D);
    this.keyJump = engine.input.keyboard.isHeld(ex.Keys.Space);
    this.keyDown =
      engine.input.keyboard.isHeld(ex.Keys.S) ||
      engine.input.keyboard.isHeld(ex.Keys.ArrowDown);
  }

  public hasChanged() {
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
    return false;
  }

  public shouldSyncPosition(isGrounded: boolean) {
    return isGrounded;
  }

  public payload(movementState: Data) {
    return {
      keyLeft: this.keyLeft,
      keyRight: this.keyRight,
      keyJump: this.keyJump,
      keyDown: this.keyDown,
      ...movementState,
    };
  }

  public statePatch(shouldSyncPosition: boolean, payload: Data) {
    return shouldSyncPosition
      ? payload
      : {
          keyLeft: this.keyLeft,
          keyRight: this.keyRight,
          keyJump: this.keyJump,
          keyDown: this.keyDown,
        };
  }

  public remember() {
    this.previousKeyLeft = this.keyLeft;
    this.previousKeyRight = this.keyRight;
    this.previousKeyJump = this.keyJump;
    this.previousKeyDown = this.keyDown;
  }

  public horizontalSign() {
    return Number(this.keyRight) - Number(this.keyLeft);
  }
}
