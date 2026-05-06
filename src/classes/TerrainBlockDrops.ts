import type { ItemEntityItem, PlayerPowerup, TerrainTileKind } from "./GameProtocol";

export type TerrainBlockDrop = {
  item: ItemEntityItem;
  count?: number;
  brokenWith?: PlayerPowerup;
};
export type ResolvedTerrainBlockDrop = {
  item: ItemEntityItem;
  count: number;
};

const terrainBlockDropsByKind = {
  dirt: [{ item: { type: "block", kind: "dirt" } }],
  grass: [{ item: { type: "block", kind: "dirt" } }],
  lamp: [{ item: { type: "block", kind: "lamp" } }],
  mushroom: [{ item: { type: "powerup", powerup: "miner" } }],
  stone: [{ item: { type: "block", kind: "stone" }, brokenWith: "miner" }],
  whiteWool: [{ item: { type: "block", kind: "whiteWool" } }],
} satisfies Partial<Record<TerrainTileKind, readonly TerrainBlockDrop[]>>;

export const terrainBlockDropsForKind = (
  kind: TerrainTileKind,
  brokenWith: PlayerPowerup,
): ResolvedTerrainBlockDrop[] =>
  (terrainBlockDropsByKind[kind] ?? [])
    .filter((drop) => !drop.brokenWith || drop.brokenWith === brokenWith)
    .map((drop) => ({
      item: drop.item,
      count: drop.count ?? 1,
    }));
