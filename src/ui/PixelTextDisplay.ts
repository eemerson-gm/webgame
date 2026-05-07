import * as ex from "excalibur";

type PixelTextOrigin = "topLeft" | "bottomRight";

const pixelTextPixelSize = 1;
const pixelTextGlyphGap = 1;
const pixelTextOutlineSize = 1;
const pixelTextGlyphs = {
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
  "A": ["111", "101", "111", "101", "101"],
  "B": ["110", "101", "110", "101", "110"],
  "C": ["111", "100", "100", "100", "111"],
  "D": ["110", "101", "101", "101", "110"],
  "E": ["111", "100", "110", "100", "111"],
  "F": ["111", "100", "110", "100", "100"],
  "G": ["111", "100", "101", "101", "111"],
  "H": ["101", "101", "111", "101", "101"],
  "I": ["111", "010", "010", "010", "111"],
  "J": ["001", "001", "001", "101", "111"],
  "K": ["101", "101", "110", "101", "101"],
  "L": ["100", "100", "100", "100", "111"],
  "M": ["101", "111", "111", "101", "101"],
  "N": ["101", "111", "111", "111", "101"],
  "O": ["111", "101", "101", "101", "111"],
  "P": ["110", "101", "110", "100", "100"],
  "Q": ["111", "101", "101", "111", "001"],
  "R": ["110", "101", "110", "101", "101"],
  "S": ["111", "100", "111", "001", "111"],
  "T": ["111", "010", "010", "010", "010"],
  "U": ["101", "101", "101", "101", "111"],
  "V": ["101", "101", "101", "101", "010"],
  "W": ["101", "101", "111", "111", "101"],
  "X": ["101", "101", "010", "101", "101"],
  "Y": ["101", "101", "010", "010", "010"],
  "Z": ["111", "001", "010", "100", "111"],
  "-": ["000", "000", "111", "000", "000"],
  ":": ["0", "1", "0", "1", "0"],
  " ": ["0", "0", "0", "0", "0"],
  "∞": ["00000", "01010", "10101", "01010", "00000"],
} satisfies Record<string, string[]>;
type PixelTextGlyph = keyof typeof pixelTextGlyphs;
const pixelTextOutlineOffsets = [
  ex.vec(-1, -1),
  ex.vec(0, -1),
  ex.vec(1, -1),
  ex.vec(-1, 0),
  ex.vec(1, 0),
  ex.vec(-1, 1),
  ex.vec(0, 1),
  ex.vec(1, 1),
];
const pixelTextGlyphHeight = pixelTextGlyphs["0"].length;
const pixelTextGlyphFor = (character: string) =>
  pixelTextGlyphs[character.toUpperCase() as PixelTextGlyph] ??
  pixelTextGlyphs["0"];
const pixelTextGlyphWidth = (character: string) =>
  pixelTextGlyphFor(character)[0].length;
const pixelTextContentWidth = (text: string) =>
  text
    .split("")
    .reduce(
      (width, character) =>
        width + pixelTextGlyphWidth(character) * pixelTextPixelSize,
      0,
    ) +
  Math.max(text.length - 1, 0) * pixelTextGlyphGap * pixelTextPixelSize;
const pixelTextSlotWidth = (characters: number) =>
  characters * pixelTextGlyphWidth("0") * pixelTextPixelSize +
  Math.max(characters - 1, 0) * pixelTextGlyphGap * pixelTextPixelSize;

export const pixelTextSize = (
  text: string,
  minimumCharacters: number = text.length,
) => ({
  width:
    Math.max(pixelTextSlotWidth(minimumCharacters), pixelTextContentWidth(text)) +
    pixelTextOutlineSize * 2,
  height: pixelTextGlyphHeight * pixelTextPixelSize + pixelTextOutlineSize * 2,
});

class PixelTextRaster extends ex.Raster {
  private readonly size: { width: number; height: number };

  constructor(
    private readonly text: string,
    private readonly minimumCharacters: number,
    private readonly textOrigin: PixelTextOrigin,
  ) {
    const size = pixelTextSize(text, minimumCharacters);
    super({
      width: size.width,
      height: size.height,
      origin:
        textOrigin === "bottomRight"
          ? ex.vec(size.width, size.height)
          : ex.vec(0, 0),
      smoothing: false,
      filtering: ex.ImageFiltering.Pixel,
    });
    this.size = size;
  }

  override clone() {
    return new PixelTextRaster(
      this.text,
      this.minimumCharacters,
      this.textOrigin,
    );
  }

  override execute(ctx: CanvasRenderingContext2D) {
    const textOffset = ex.vec(pixelTextOutlineSize, pixelTextOutlineSize);
    pixelTextOutlineOffsets.forEach((offset) =>
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
      this.size.width -
      pixelTextOutlineSize * 2 -
      pixelTextContentWidth(this.text);
    this.text.split("").forEach((character, characterIndex) => {
      const glyph = pixelTextGlyphFor(character);
      const characterX =
        startX +
        this.text
          .slice(0, characterIndex)
          .split("")
          .reduce(
            (width, previousCharacter) =>
              width +
              (pixelTextGlyphWidth(previousCharacter) + pixelTextGlyphGap) *
                pixelTextPixelSize,
            0,
          );
      glyph.forEach((row, rowIndex) => {
        row.split("").forEach((pixel, columnIndex) => {
          if (pixel !== "1") {
            return;
          }
          ctx.fillRect(
            characterX + columnIndex * pixelTextPixelSize + offset.x,
            rowIndex * pixelTextPixelSize + offset.y,
            pixelTextPixelSize,
            pixelTextPixelSize,
          );
        });
      });
    });
  }
}

export class PixelTextDisplay extends ex.Actor {
  private text: string;

  constructor(
    text: string,
    pos: ex.Vector,
    private readonly options: {
      minimumCharacters?: number;
      origin?: PixelTextOrigin;
    } = {},
  ) {
    const minimumCharacters = options.minimumCharacters ?? text.length;
    const size = pixelTextSize(text, minimumCharacters);
    super({
      pos,
      anchor: ex.vec(0, 0),
      width: size.width,
      height: size.height,
    });
    this.text = text;
    this.graphics.use(
      new PixelTextRaster(text, minimumCharacters, options.origin ?? "topLeft"),
    );
  }

  public setText(text: string) {
    if (text === this.text) {
      return;
    }
    this.text = text;
    this.graphics.use(
      new PixelTextRaster(
        text,
        this.options.minimumCharacters ?? text.length,
        this.options.origin ?? "topLeft",
      ),
    );
  }
}
