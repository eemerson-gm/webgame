import type { WorldBounds } from "../simulation/entityPhysics";
import type { DamageableActor } from "./DamageableActor";
import type { Player } from "./Player";

export type EntityActor = DamageableActor<Player> & {
  entityId: () => string;
  overlapsWorldBounds: (bounds: WorldBounds) => boolean;
  knockBackFrom: (player: Player) => void;
  contactDamage: () => number;
};
