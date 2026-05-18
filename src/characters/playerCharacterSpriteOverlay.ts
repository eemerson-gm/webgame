import type { ImageSource } from "excalibur";
import { Resources } from "../resource";

export const playerCharacterSpriteOverlayByKey: Record<
  string,
  ImageSource
> = {
  Player: Resources.CharacterJamesIdle,
  PlayerWalk1: Resources.CharacterJamesWalk1,
  PlayerWalk2: Resources.CharacterJamesWalk2,
  PlayerJump: Resources.CharacterJamesJump,
  PlayerCrouch: Resources.CharacterJamesIdle,
};
