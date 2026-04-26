import type { EntityState } from "../classes/GameProtocol";
import { TILE_PX } from "../world/worldConfig";

const slimeSpawnColumn = 8;
const slimeSize = TILE_PX;
const slimeHealth = 3;

export const createInitialEntitiesData = (
  surfaceStartByColumn: number[],
): Record<string, EntityState> => {
  const surfaceRow = surfaceStartByColumn[slimeSpawnColumn];
  return {
    slime0: {
      id: "slime0",
      type: "slime",
      x: slimeSpawnColumn * TILE_PX,
      y: surfaceRow * TILE_PX - slimeSize,
      horizontalSpeed: 0,
      verticalSpeed: 0,
      facingLeft: false,
      isGrounded: true,
      isJumping: false,
      health: slimeHealth,
      knockbackMs: 0,
    },
  };
};
