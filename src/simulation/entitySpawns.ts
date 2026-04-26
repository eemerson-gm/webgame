import type { EntityState } from "../classes/GameProtocol";
import { TILE_PX } from "../world/worldConfig";

const slimeSpawnColumn = 8;
const slimeSize = TILE_PX;
const slimeHealth = 3;

export const createSlimeEntityState = (
  id: string,
  x: number,
  y: number,
  ownerId?: string,
): EntityState => ({
  id,
  type: "slime",
  ownerId,
  x,
  y,
  horizontalSpeed: 0,
  verticalSpeed: 0,
  facingLeft: false,
  isGrounded: true,
  isJumping: false,
  health: slimeHealth,
  knockbackMs: 0,
});

export const createInitialEntitiesData = (
  surfaceStartByColumn: number[],
): Record<string, EntityState> => {
  const surfaceRow = surfaceStartByColumn[slimeSpawnColumn];
  return {
    slime0: createSlimeEntityState(
      "slime0",
      slimeSpawnColumn * TILE_PX,
      surfaceRow * TILE_PX - slimeSize,
    ),
  };
};
