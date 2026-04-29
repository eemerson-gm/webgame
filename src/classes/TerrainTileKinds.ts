import type { TerrainTileKind } from "./GameProtocol";

export const terrainTileKinds = [
  "bedrock",
  "blackWool",
  "blueWool",
  "dirt",
  "greenWool",
  "grass",
  "lamp",
  "orangeWool",
  "pillarBottom",
  "pillarMiddle",
  "pillarTop",
  "purpleWool",
  "redWool",
  "spawn",
  "spawnOrb",
  "stone",
  "whiteWool",
  "yellowWool",
] as const satisfies readonly TerrainTileKind[];

const solidTerrainTileKinds: readonly TerrainTileKind[] = [
  "bedrock",
  "blackWool",
  "blueWool",
  "dirt",
  "greenWool",
  "grass",
  "lamp",
  "orangeWool",
  "purpleWool",
  "redWool",
  "spawn",
  "stone",
  "whiteWool",
  "yellowWool",
] as const;

const breakableTerrainTileKinds: readonly TerrainTileKind[] = [
  "blackWool",
  "blueWool",
  "dirt",
  "greenWool",
  "grass",
  "lamp",
  "orangeWool",
  "purpleWool",
  "redWool",
  "stone",
  "whiteWool",
  "yellowWool",
] as const;

export const isTerrainTileKind = (kind: unknown): kind is TerrainTileKind =>
  terrainTileKinds.includes(kind as TerrainTileKind);

export const isSolidTerrainTileKind = (kind: TerrainTileKind) =>
  solidTerrainTileKinds.includes(kind);

export const isBreakableTerrainTileKind = (kind: TerrainTileKind) =>
  breakableTerrainTileKinds.includes(kind);

export const solidTerrainTileKeys = (
  terrainTiles: Record<string, TerrainTileKind>,
) =>
  Object.entries(terrainTiles)
    .filter(([_key, kind]) => isSolidTerrainTileKind(kind))
    .map(([key]) => key);
