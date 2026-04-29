import type { TerrainTileKind } from "../classes/GameProtocol";
import { Structure } from "./Structure";

const spawnStructureRows = ["O...O", "T...T", "M...M", "B...B", "PPPPP"];
const spawnStructurePalette = {
  ".": null,
  B: "pillarBottom",
  M: "pillarMiddle",
  O: "spawnOrb",
  P: "spawn",
  S: "stone",
  T: "pillarTop",
} satisfies Record<string, TerrainTileKind | null>;

const spawnStructureWidth = spawnStructureRows[0].length;

const spawnStructureOrigin = (
  columns: number,
  rows: number,
  surfaceStartByColumn: number[],
) => {
  const centerColumn = Math.floor(columns / 2);
  const originColumn = Math.max(
    0,
    Math.min(
      columns - spawnStructureWidth,
      centerColumn - Math.floor(spawnStructureWidth / 2),
    ),
  );
  const surfaceRow = surfaceStartByColumn[centerColumn] ?? Math.floor(rows / 2);
  const originRow = Math.max(
    0,
    Math.min(rows - spawnStructureRows.length, surfaceRow - 4),
  );
  return {
    column: originColumn,
    row: originRow,
  };
};

export class SpawnStructure extends Structure {
  constructor(columns: number, rows: number, surfaceStartByColumn: number[]) {
    super({
      origin: spawnStructureOrigin(columns, rows, surfaceStartByColumn),
      rows: spawnStructureRows,
      palette: spawnStructurePalette,
      spawnOffset: {
        column: Math.floor(spawnStructureWidth / 2),
        row: 3,
      },
    });
  }
}
