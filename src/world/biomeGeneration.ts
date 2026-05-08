import type { BiomeDefinition, WorldDefinition } from "./worldDefinition";
import { loadBiomeDefinition } from "./worldDefinition";

const fallbackBandForColumn = (definition: WorldDefinition, column: number) =>
  definition.biomeBands.find(
    (band) => column >= band.startColumn && column <= band.endColumn,
  ) ?? definition.biomeBands[0];

export const biomeIdForColumn = (definition: WorldDefinition, column: number) =>
  fallbackBandForColumn(definition, column)?.biome ?? "";

export const biomeForColumn = (
  definition: WorldDefinition,
  column: number,
): BiomeDefinition => loadBiomeDefinition(biomeIdForColumn(definition, column));
