import type { CollisionBounds } from "../actors/MovingActor";
import type { Player } from "../actors/Player";
import * as ex from "excalibur";
import {
  axisAlignedOverlap,
  collisionBoundsWorldBox,
  isWeaponPartActive,
  weaponPartWorldBox,
} from "./CombatBounds";

const swordHitMinElapsedRatio = 0.1;

export type WeaponHitAttacker = {
  playerId: string;
  player: Player;
};

export type WeaponHitTarget = {
  id: string;
  pos: ex.Vector;
  collisionBounds: CollisionBounds;
  canTakeWeaponHit: () => boolean;
  onWeaponHit: (attacker: Player) => void;
};

export class WeaponHitMemory {
  private readonly swingKeys = new Set<string>();
  private readonly lastCycles = new Map<string, number>();

  public syncAttackerCycle(attackerId: string, cycle: number) {
    const lastCycle = this.lastCycles.get(attackerId);
    if (lastCycle === cycle) {
      return;
    }
    this.lastCycles.set(attackerId, cycle);
    [...this.swingKeys]
      .filter((key) => key.startsWith(`${attackerId}:`))
      .reduce((_, key) => {
        this.swingKeys.delete(key);
        return null;
      }, null);
  }

  public canHit(attackerId: string, cycle: number, targetId: string) {
    return !this.swingKeys.has(`${attackerId}:${cycle}:${targetId}`);
  }

  public rememberHit(attackerId: string, cycle: number, targetId: string) {
    this.swingKeys.add(`${attackerId}:${cycle}:${targetId}`);
  }
}

const resolveWeaponHitTarget = (
  options: {
    hitMemory: WeaponHitMemory;
    targets: readonly WeaponHitTarget[];
  },
  attacker: WeaponHitAttacker,
  weaponBox: ReturnType<typeof weaponPartWorldBox>,
  attackCycle: number,
  targetIndex: number,
) => {
  if (targetIndex >= options.targets.length) {
    return;
  }
  const target = options.targets[targetIndex];
  const { playerId, player } = attacker;
  if (playerId !== target.id && target.canTakeWeaponHit()) {
    const bodyBox = collisionBoundsWorldBox(
      target.pos.x,
      target.pos.y,
      target.collisionBounds,
    );
    if (axisAlignedOverlap(weaponBox, bodyBox)) {
      if (options.hitMemory.canHit(playerId, attackCycle, target.id)) {
        options.hitMemory.rememberHit(playerId, attackCycle, target.id);
        target.onWeaponHit(player);
      }
    }
  }
  resolveWeaponHitTarget(
    options,
    attacker,
    weaponBox,
    attackCycle,
    targetIndex + 1,
  );
};

const resolveWeaponHitAttacker = (
  options: {
    attackers: readonly WeaponHitAttacker[];
    targets: readonly WeaponHitTarget[];
    hitMemory: WeaponHitMemory;
  },
  attackerIndex: number,
) => {
  if (attackerIndex >= options.attackers.length) {
    return;
  }
  const attacker = options.attackers[attackerIndex];
  const { playerId, player } = attacker;
  if (
    player.isSwordAttackActive() &&
    player.swordAttackElapsedRatio() >= swordHitMinElapsedRatio
  ) {
    const weaponActor = player.swordWeaponActor();
    if (weaponActor && isWeaponPartActive(weaponActor)) {
      const attackCycle = player.swordAttackCycle();
      options.hitMemory.syncAttackerCycle(playerId, attackCycle);
      const weaponBox = weaponPartWorldBox(player, weaponActor);
      resolveWeaponHitTarget(
        options,
        attacker,
        weaponBox,
        attackCycle,
        0,
      );
    }
  }
  resolveWeaponHitAttacker(options, attackerIndex + 1);
};

export const resolveWeaponHits = (options: {
  attackers: readonly WeaponHitAttacker[];
  targets: readonly WeaponHitTarget[];
  hitMemory: WeaponHitMemory;
}) => {
  resolveWeaponHitAttacker(options, 0);
};
