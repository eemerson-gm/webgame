import * as ex from "excalibur";
import { PixelTextDisplay, pixelTextSize } from "./PixelTextDisplay";

const fpsDisplayUpdateIntervalMs = 250;
const fpsDisplayText = "FPS 000";
const fpsDisplaySize = pixelTextSize(fpsDisplayText);

export class FpsDisplay {
  private readonly display: PixelTextDisplay;
  private elapsedMs: number = 0;
  private frames: number = 0;
  private currentText: string = fpsDisplayText;

  constructor(rightTop: ex.Vector) {
    this.display = new PixelTextDisplay(
      fpsDisplayText,
      rightTop.sub(ex.vec(fpsDisplaySize.width, 0)),
    );
  }

  public getActors(): ex.Actor[] {
    return [this.display];
  }

  public sync(delta: number) {
    this.elapsedMs += delta;
    this.frames += 1;
    if (this.elapsedMs < fpsDisplayUpdateIntervalMs) {
      return;
    }
    const fps = Math.min(999, Math.round((this.frames * 1000) / this.elapsedMs));
    this.elapsedMs = 0;
    this.frames = 0;
    this.setText(`FPS ${fps.toString().padStart(3, "0")}`);
  }

  private setText(text: string) {
    if (text === this.currentText) {
      return;
    }
    this.currentText = text;
    this.display.setText(text);
  }
}
