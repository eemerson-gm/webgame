import * as ex from "excalibur";
import { PixelTextDisplay } from "./PixelTextDisplay";

const blockCountMinimumDigits = 2;

export class BlockCountDisplay extends PixelTextDisplay {
  constructor(text: string, pos: ex.Vector) {
    super(text, pos, {
      minimumCharacters: Math.max(blockCountMinimumDigits, text.length),
      origin: "bottomRight",
    });
  }
}
