import swordJson from "../data/animations/player_sword.json";
import type { JsonSpriteAnimationSpec } from "../animations/jsonSpriteAnimation/types";
import { TILE_PX } from "../world/worldConfig";

type AxisAlignedBox = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

/** Matches `playerGraphicOffset` in `PlayerVisuals` (no Excalibur import). */
const playerGraphicOffset = { x: TILE_PX / 2, y: TILE_PX / 2 };

/** `public/assets/weapons/weapon_sword_stick.png` */
const swordWeaponWidth = 15;
const swordWeaponHeight = 7;

const swordWeaponAnchor = { x: 0, y: 0.5 };

const playerSwordSpec = swordJson as JsonSpriteAnimationSpec;

const swordWeaponPoses = playerSwordSpec.frames.map((frame) => {
  const pose = frame.sprites.find((sprite) => sprite.id === "weapon");
  if (!pose) {
    throw new Error("player_sword.json is missing a weapon sprite pose");
  }
  return pose;
});

const swordSpeed = playerSwordSpec.speed ?? 1;

/** Matches `JsonSpriteAnimation.durationMs()` for `player_sword.json`. */
export const swordAttackDurationMs =
  playerSwordSpec.frames.length *
  (playerSwordSpec.frameDurationMs / swordSpeed);

const swordFrameDurationMs = swordAttackDurationMs / playerSwordSpec.frames.length;

const anchorForFacing = (facingLeft: boolean) =>
  facingLeft
    ? { x: 1 - swordWeaponAnchor.x, y: swordWeaponAnchor.y }
    : swordWeaponAnchor;

const boxFromAnchor = (
  worldX: number,
  worldY: number,
  width: number,
  height: number,
  anchor: { x: number; y: number },
): AxisAlignedBox => ({
  left: worldX - width * anchor.x,
  right: worldX + width * (1 - anchor.x),
  top: worldY - height * anchor.y,
  bottom: worldY + height * (1 - anchor.y),
});

const frameIndexForElapsedRatio = (elapsedRatio: number): number => {
  const elapsedMs = elapsedRatio * swordAttackDurationMs;
  const index = Math.floor(elapsedMs / Math.max(swordFrameDurationMs, 0.0001));
  return Math.min(index, swordWeaponPoses.length - 1);
};

/** Server hitbox aligned with client `weaponPartWorldBox` for the sword swing. */
export const swordWeaponBoxAtElapsed = (
  hostX: number,
  hostY: number,
  facingLeft: boolean,
  elapsedRatio: number,
): AxisAlignedBox => {
  const pose = swordWeaponPoses[frameIndexForElapsedRatio(elapsedRatio)];
  const offsetX = facingLeft ? -pose.offset.x : pose.offset.x;
  const worldX = hostX + playerGraphicOffset.x + offsetX;
  const worldY = hostY + playerGraphicOffset.y + pose.offset.y;
  return boxFromAnchor(
    worldX,
    worldY,
    swordWeaponWidth,
    swordWeaponHeight,
    anchorForFacing(facingLeft),
  );
};
