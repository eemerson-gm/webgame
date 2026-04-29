import type { TerrainTileKind } from "../classes/GameProtocol";
import { terrainTileKey } from "./terrainTiles";

type StructurePosition = {
  column: number;
  row: number;
};

type StructureOptions = {
  origin: StructurePosition;
  rows: string[];
  palette: Record<string, TerrainTileKind | null>;
  spawnOffset: StructurePosition;
};

type StructureTile = {
  column: number;
  row: number;
  kind: TerrainTileKind | null;
};

export class Structure {
  private readonly origin: StructurePosition;
  private readonly rows: string[];
  private readonly palette: Record<string, TerrainTileKind | null>;
  private readonly spawnOffset: StructurePosition;

  constructor(options: StructureOptions) {
    this.origin = options.origin;
    this.rows = options.rows;
    this.palette = options.palette;
    this.spawnOffset = options.spawnOffset;
  }

  public applyTo(terrainTiles: Record<string, TerrainTileKind>) {
    this.tiles().forEach((tile) => {
      const key = terrainTileKey(tile.column, tile.row);
      if (tile.kind) {
        terrainTiles[key] = tile.kind;
        return;
      }
      delete terrainTiles[key];
    });
    return terrainTiles;
  }

  public spawnPosition(tileSize: number) {
    return {
      x: (this.origin.column + this.spawnOffset.column) * tileSize,
      y: (this.origin.row + this.spawnOffset.row) * tileSize,
    };
  }

  private tiles(): StructureTile[] {
    return this.rows.flatMap((rowTiles, rowOffset) =>
      rowTiles.split("").flatMap((symbol, columnOffset) => {
        if (!(symbol in this.palette)) {
          return [];
        }
        return [
          {
            column: this.origin.column + columnOffset,
            row: this.origin.row + rowOffset,
            kind: this.palette[symbol],
          },
        ];
      }),
    );
  }
}
