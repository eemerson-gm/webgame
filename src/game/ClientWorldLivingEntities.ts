import type { LivingActor } from "../actors/LivingActor";
import type { EntitySeparationBody } from "../actors/MovingActor";
import type { Player } from "../actors/Player";
import type { WeaponHitTarget } from "../combat/WeaponCombat";

export type LivingEntityRegistration = {
  entityId: string;
  living: LivingActor;
  onWeaponHit: (attacker: Player) => void;
};

export type EntitySeparationEntry = {
  body: EntitySeparationBody;
  applySeparatedX: (x: number) => void;
};

export class ClientWorldLivingEntities {
  private weaponTargets: LivingEntityRegistration[] = [];
  private separationEntries: Array<{
    entityId: string;
    living: LivingActor;
    canSeparate: boolean;
  }> = [];

  public register(registration: LivingEntityRegistration) {
    this.weaponTargets.push(registration);
    this.separationEntries.push({
      entityId: registration.entityId,
      living: registration.living,
      canSeparate: true,
    });
  }

  public unregister(entityId: string) {
    this.weaponTargets = this.weaponTargets.filter(
      (entry) => entry.entityId !== entityId,
    );
    this.separationEntries = this.separationEntries.filter(
      (entry) => entry.entityId !== entityId,
    );
  }

  public weaponHitTargets(): WeaponHitTarget[] {
    return this.weaponTargets
      .filter((entry) => entry.living.isAlive())
      .map((entry) => ({
        id: entry.entityId,
        pos: entry.living.pos,
        collisionBounds: entry.living.hurtCollisionBounds(),
        canTakeWeaponHit: () => entry.living.canReceiveWeaponDamage(),
        onWeaponHit: entry.onWeaponHit,
      }));
  }

  public entitySeparationEntries(): EntitySeparationEntry[] {
    return this.separationEntries
      .filter((entry) => entry.living.isAlive())
      .map((entry) =>
        entry.living.separationEntry(entry.entityId, entry.canSeparate),
      );
  }
}
