import type { TerrainTileKind } from "../classes/GameProtocol";
import { Structure } from "./Structure";
import type {
  StructureDefinition,
  StructurePlacementDefinition,
  WorldDimensionsDefinition,
} from "./worldDefinition";

type StructureOriginOptions = {
  definition: StructureDefinition;
  dimensions: WorldDimensionsDefinition;
  surfaceStartByColumn: number[];
  placement: StructurePlacementDefinition;
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const structureWidth = (definition: StructureDefinition) => definition.rows[0].length;
const structureHeight = (definition: StructureDefinition) => definition.rows.length;

const worldCenterSurfaceOrigin = (options: StructureOriginOptions) => {
  const width = structureWidth(options.definition);
  const height = structureHeight(options.definition);
  const centerColumn = Math.floor(options.dimensions.columns / 2);
  const columnOffset = options.placement.columnOffset ?? 0;
  const rowOffset = options.placement.rowOffset ?? 0;
  const originColumn = clamp(
    centerColumn - Math.floor(width / 2) + columnOffset,
    0,
    options.dimensions.columns - width,
  );
  const surfaceRow =
    options.surfaceStartByColumn[centerColumn] ?? Math.floor(options.dimensions.rows / 2);
  return {
    column: originColumn,
    row: clamp(surfaceRow + rowOffset, 0, options.dimensions.rows - height),
  };
};

export const structureFromDefinition = (options: StructureOriginOptions) =>
  new Structure({
    origin: worldCenterSurfaceOrigin(options),
    rows: options.definition.rows,
    palette: options.definition.palette satisfies Record<string, TerrainTileKind | null>,
    spawnOffset: options.definition.spawnOffset,
  });
