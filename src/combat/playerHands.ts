export type PlayerHand = "handLeft" | "handRight";

export type HandAttackAnimation = "sword" | "pickaxe";

const handAttackByHand: Record<PlayerHand, HandAttackAnimation> = {
  handLeft: "sword",
  handRight: "pickaxe",
};

export const getHandAttackAnimation = (
  hand: PlayerHand,
): HandAttackAnimation => handAttackByHand[hand];
