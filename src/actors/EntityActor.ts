import type { WorldBounds } from "../simulation/entityPhysics";
import type { Player } from "./Player";

export type EntityActor = {
  overlapsWorldBounds: (bounds: WorldBounds) => boolean;
  knockBackFrom: (player: Player) => void;
};
