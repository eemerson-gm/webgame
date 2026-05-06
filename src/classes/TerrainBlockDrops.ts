import type { PlayerPowerup, TerrainTileKind } from "./GameProtocol";

export type TerrainBlockDrop = {
  kind: TerrainTileKind;
  count?: number;
  brokenWith?: PlayerPowerup;
};
export type ResolvedTerrainBlockDrop = {
  kind: TerrainTileKind;
  count: number;
};

const placeableTerrainDropKinds = [
  "dirt",
  "grass",
  "lamp",
  "stone",
  "whiteWool",
] as const satisfies readonly TerrainTileKind[];

const terrainBlockDropsByKind = {
  dirt: [{ kind: "dirt" }],
  grass: [{ kind: "dirt" }],
  lamp: [{ kind: "lamp" }],
  stone: [{ kind: "stone", brokenWith: "miner" }],
  whiteWool: [{ kind: "whiteWool" }],
} satisfies Partial<Record<TerrainTileKind, readonly TerrainBlockDrop[]>>;

export const isPlaceableTerrainDropKind = (
  kind: TerrainTileKind,
): kind is (typeof placeableTerrainDropKinds)[number] =>
  placeableTerrainDropKinds.includes(
    kind as (typeof placeableTerrainDropKinds)[number],
  );

export const terrainBlockDropsForKind = (
  kind: TerrainTileKind,
  brokenWith: PlayerPowerup,
): ResolvedTerrainBlockDrop[] =>
  (terrainBlockDropsByKind[kind] ?? [])
    .filter((drop) => !drop.brokenWith || drop.brokenWith === brokenWith)
    .map((drop) => ({
      kind: drop.kind,
      count: drop.count ?? 1,
    }));
