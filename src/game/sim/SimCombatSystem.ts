import {
  axisAlignedOverlap,
  collisionBoundsWorldBox,
  type AxisAlignedBox,
} from "../../physics/entityPhysics";
import { swordWeaponBoxAtElapsed } from "../../combat/swordWeaponHitbox";
import { swordHitMinElapsedRatio } from "./simConfig";
import type { SimPlayer } from "./SimPlayer";
import type { SimSlime } from "./SimSlime";

export class SimCombatSystem {
  private readonly swingKeys = new Set<string>();
  private readonly lastCycles = new Map<string, number>();

  public tick(players: SimPlayer[], slimes: SimSlime[]) {
    players.forEach((attacker) => {
      if (!attacker.isSwordAttackActive()) {
        return;
      }
      if (attacker.swordAttackElapsedRatio() < swordHitMinElapsedRatio) {
        return;
      }
      const weaponBox = swordWeaponBoxAtElapsed(
        attacker.x,
        attacker.y,
        attacker.facingLeft,
        attacker.swordAttackElapsedRatio(),
      );
      this.syncAttackerCycle(attacker.id, attacker.attackCycle);
      slimes.forEach((slime) => {
        if (!slime.isAlive() || slime.isDead) {
          return;
        }
        this.tryHit(attacker.id, attacker.attackCycle, slime, weaponBox, () => {
          const depleted = slime.applyDamage(1);
          if (depleted) {
            slime.markDead();
            slime.knockBackFromFacing(attacker.facingLeft);
          } else {
            slime.knockBackFromFacing(attacker.facingLeft);
          }
        });
      });
      players.forEach((target) => {
        if (target.id === attacker.id || !target.isAlive() || target.isPaused) {
          return;
        }
        this.tryHit(attacker.id, attacker.attackCycle, target, weaponBox, () => {
          const depleted = target.applyDamage(1);
          if (depleted) {
            target.respawn();
          } else {
            target.knockBackFromFacing(attacker.facingLeft);
          }
        });
      });
    });
  }

  private tryHit(
    attackerId: string,
    cycle: number,
    target: {
      id: string;
      x: number;
      y: number;
      hurtCollisionBounds: () => import("../../physics/entityPhysics").CollisionBounds;
      canTakeDamage: () => boolean;
    },
    weaponBox: AxisAlignedBox,
    onHit: () => void,
  ) {
    if (!target.canTakeDamage()) {
      return;
    }
    const bodyBox = collisionBoundsWorldBox(
      target.x,
      target.y,
      target.hurtCollisionBounds(),
    );
    if (!axisAlignedOverlap(weaponBox, bodyBox)) {
      return;
    }
    const key = `${attackerId}:${cycle}:${target.id}`;
    if (this.swingKeys.has(key)) {
      return;
    }
    this.swingKeys.add(key);
    onHit();
  }

  private syncAttackerCycle(attackerId: string, cycle: number) {
    const lastCycle = this.lastCycles.get(attackerId);
    if (lastCycle === cycle) {
      return;
    }
    this.lastCycles.set(attackerId, cycle);
    [...this.swingKeys]
      .filter((key) => key.startsWith(`${attackerId}:`))
      .forEach((key) => {
        this.swingKeys.delete(key);
      });
  }
}
