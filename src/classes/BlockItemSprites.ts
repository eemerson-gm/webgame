import * as ex from "excalibur";
import type { PlaceableBlockKind } from "./ToolbarSelection";
import { Resources } from "../resource";

const blockItemSourceEdgeCut = 1;

export const blockItemResourceByKind = {
  dirt: Resources.Dirt,
  grass: Resources.Grass,
  lamp: Resources.Lamp,
  stone: Resources.Stone,
  whiteWool: Resources.WhiteWool,
} satisfies Record<PlaceableBlockKind, ex.ImageSource>;

export const blockItemResourceForKind = (kind: PlaceableBlockKind) =>
  blockItemResourceByKind[kind];

export const blockItemSpriteForImage = (
  image: ex.ImageSource,
  spriteSize: number,
) => {
  const sprite = image.toSprite();
  const sourceWidth = sprite.width - blockItemSourceEdgeCut * 2;
  const sourceHeight = sprite.height - blockItemSourceEdgeCut * 2;
  const sourceX =
    blockItemSourceEdgeCut + Math.floor((sourceWidth - spriteSize) / 2);
  const sourceY =
    blockItemSourceEdgeCut + Math.floor((sourceHeight - spriteSize) / 2);
  return new ex.Sprite({
    image,
    sourceView: {
      x: sourceX,
      y: sourceY,
      width: spriteSize,
      height: spriteSize,
    },
  });
};

export const blockItemSpriteForKind = (
  kind: PlaceableBlockKind,
  spriteSize: number,
) => blockItemSpriteForImage(blockItemResourceForKind(kind), spriteSize);
