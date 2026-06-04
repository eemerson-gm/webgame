import type { LivingActor } from "../actors/LivingActor";
import type { EntitySeparationBody } from "../actors/MovingActor";
import type { Player } from "../actors/Player";
import type { WeaponHitTarget } from "../combat/WeaponCombat";
import {
  separateEntityBodies,
  type TileCollisionWorld,
} from "../physics/entityPhysics";
import {
  entitySeparationMaxMoveX,
  entitySeparationPadding,
  entitySeparationPasses,
} from "./sim/simConfig";

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

  /** Same separation pass as server (`WorldRoomSimulator.separateEntities`). */
  public applyEntitySeparation(world: TileCollisionWorld): void {
    const entries = this.entitySeparationEntries();
    if (entries.length < 2) {
      return;
    }
    const separated = separateEntityBodies(
      entries.map((entry) => entry.body),
      {
        world,
        padding: entitySeparationPadding,
        maxMoveX: entitySeparationMaxMoveX,
        passes: entitySeparationPasses,
      },
    );
    const byId = new Map(separated.map((body) => [body.id, body]));
    for (const entry of entries) {
      const body = byId.get(entry.body.id);
      if (body) {
        entry.applySeparatedX(body.x);
      }
    }
  }
}
