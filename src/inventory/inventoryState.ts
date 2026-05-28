export const backpackSize = 16;

export type InventoryState = {
  backpack: (string | null)[];
  equippedHandLeftId: string | null;
  equippedHandRightId: string | null;
  equippedBootsId: string | null;
  equippedHeadId: string | null;
  equippedRingId: string | null;
};

const emptyBackpack = (): (string | null)[] =>
  Array.from({ length: backpackSize }, () => null);

export const createEmptyInventoryState = (): InventoryState => ({
  backpack: emptyBackpack(),
  equippedHandLeftId: null,
  equippedHandRightId: null,
  equippedBootsId: null,
  equippedHeadId: null,
  equippedRingId: null,
});
