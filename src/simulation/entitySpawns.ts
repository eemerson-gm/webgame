import type {
  EntityState,
  ItemEntityItem,
  ItemEntityState,
  SlimeEntityState,
} from "../classes/GameProtocol";

const slimeHealth = 3;

export const createSlimeEntityState = (
  id: string,
  x: number,
  y: number,
  ownerId?: string,
): SlimeEntityState => ({
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

export const createItemEntityState = (
  id: string,
  x: number,
  y: number,
  item: ItemEntityItem,
  count: number,
  collectibleAtMs: number,
  ownerId: string | undefined,
  horizontalSpeed: number,
  verticalSpeed: number,
): ItemEntityState => ({
  id,
  type: "item",
  ownerId,
  x,
  y,
  horizontalSpeed,
  verticalSpeed,
  isGrounded: false,
  isJumping: false,
  item,
  count,
  collectibleAtMs,
});

export const createInitialEntitiesData = (): Record<string, EntityState> => ({});
