import type { TerrainTileKind } from "../classes/GameProtocol";
import grasslandsJson from "../data/biomes/grasslands.json";
import stoneDepthsJson from "../data/biomes/stoneDepths.json";
import spawnJson from "../data/structures/spawn.json";
import publicWorldJson from "../data/worlds/public.json";
import type { TerrainSurfaceParams } from "./terrainGen";
import type { TerrainTileBiomeConfig } from "./terrainTiles";

export type WorldDimensionsDefinition = {
  columns: number;
  rows: number;
};

export type WorldSurfaceDefinition = TerrainSurfaceParams;

export type BiomeBandDefinition = {
  biome: string;
  startColumn: number;
  endColumn: number;
};

export type StructurePlacementDefinition = {
  kind: "worldCenterSurface";
  rowOffset?: number;
  columnOffset?: number;
};

export type WorldStructureDefinition = {
  structure: string;
  placement: StructurePlacementDefinition;
  protectTiles: boolean;
  setsPlayerSpawn: boolean;
};

export type TileAboveSurfaceDecorationDefinition = {
  kind: "tileAboveSurface";
  tile: TerrainTileKind;
  columns: number[];
  skipProtected: boolean;
};

export type WorldDecorationDefinition = TileAboveSurfaceDecorationDefinition;

export type WorldDefinition = {
  id: string;
  name: string;
  dimensions: WorldDimensionsDefinition;
  surface: WorldSurfaceDefinition;
  biomeBands: BiomeBandDefinition[];
  structures: WorldStructureDefinition[];
  decorations: WorldDecorationDefinition[];
};

export type BiomeDefinition = {
  id: string;
  terrain: TerrainTileBiomeConfig;
};

export type StructureDefinition = {
  id: string;
  rows: string[];
  palette: Record<string, TerrainTileKind | null>;
  spawnOffset: {
    column: number;
    row: number;
  };
};

export const worldDefinitions: Record<string, WorldDefinition> = {
  public: publicWorldJson as WorldDefinition,
};

export const biomeDefinitions: Record<string, BiomeDefinition> = {
  grasslands: grasslandsJson as BiomeDefinition,
  stoneDepths: stoneDepthsJson as BiomeDefinition,
};

export const structureDefinitions: Record<string, StructureDefinition> = {
  spawn: spawnJson as StructureDefinition,
};

const missingDefinition = (kind: string, id: string): never => {
  throw new Error(`Unknown ${kind}: ${id}`);
};

export const loadWorldDefinition = (id: string): WorldDefinition =>
  worldDefinitions[id] ?? missingDefinition("world", id);

export const loadBiomeDefinition = (id: string): BiomeDefinition =>
  biomeDefinitions[id] ?? missingDefinition("biome", id);

export const loadStructureDefinition = (id: string): StructureDefinition =>
  structureDefinitions[id] ?? missingDefinition("structure", id);
