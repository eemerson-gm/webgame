import * as ex from "excalibur";

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

export class BlockCountRaster extends ex.Raster {
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

export class BlockCountDisplay extends ex.Actor {
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
