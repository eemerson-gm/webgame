import * as ex from "excalibur";
import type { CollisionBounds } from "../physics/entityPhysics";

export type AxisAlignedBox = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

const hiddenPositionThreshold = -99_999;

export const axisAlignedOverlap = (
  left: AxisAlignedBox,
  right: AxisAlignedBox,
) =>
  left.left < right.right &&
  left.right > right.left &&
  left.top < right.bottom &&
  left.bottom > right.top;

export const collisionBoundsWorldBox = (
  x: number,
  y: number,
  bounds: CollisionBounds,
): AxisAlignedBox => ({
  left: x + bounds.offsetX,
  right: x + bounds.offsetX + bounds.width,
  top: y + bounds.offsetY,
  bottom: y + bounds.offsetY + bounds.height,
});

export const isWeaponPartActive = (weaponActor: ex.Actor) => {
  if (!weaponActor.graphics.visible) {
    return false;
  }
  if (weaponActor.graphics.opacity <= 0) {
    return false;
  }
  if (weaponActor.pos.x < hiddenPositionThreshold) {
    return false;
  }
  return true;
};

export const axisAlignedBoxFromAnchor = (
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

const rotatedEnvelopeHalfExtents = (
  width: number,
  height: number,
  rotation: number,
) => {
  const cos = Math.abs(Math.cos(rotation));
  const sin = Math.abs(Math.sin(rotation));
  return {
    halfWidth: (width * cos + height * sin) / 2,
    halfHeight: (width * sin + height * cos) / 2,
  };
};

export const weaponPartWorldBox = (
  host: ex.Actor,
  weaponActor: ex.Actor,
): AxisAlignedBox => {
  const worldX = host.pos.x + weaponActor.pos.x;
  const worldY = host.pos.y + weaponActor.pos.y;
  const anchor = weaponActor.graphics.anchor;
  const base = axisAlignedBoxFromAnchor(
    worldX,
    worldY,
    weaponActor.width,
    weaponActor.height,
    anchor,
  );
  if (weaponActor.rotation === 0) {
    return base;
  }
  const centerX = (base.left + base.right) / 2;
  const centerY = (base.top + base.bottom) / 2;
  const envelope = rotatedEnvelopeHalfExtents(
    weaponActor.width,
    weaponActor.height,
    weaponActor.rotation,
  );
  return {
    left: centerX - envelope.halfWidth,
    right: centerX + envelope.halfWidth,
    top: centerY - envelope.halfHeight,
    bottom: centerY + envelope.halfHeight,
  };
};
