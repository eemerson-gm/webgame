import type { TerrainTileKind } from "./GameProtocol";
import { terrainTileKinds } from "./TerrainTileKinds";

const noneKindId = 255;

const kindIdByKind = terrainTileKinds.reduce(
  (acc, kind, index) => {
    acc[kind] = index;
    return acc;
  },
  {} as Record<TerrainTileKind, number>,
);

const idToKind = terrainTileKinds as unknown as TerrainTileKind[];

export class TerrainTileGrid {
  private readonly kindIds: Uint8Array;

  constructor(
    private readonly columns: number,
    private readonly rows: number,
    terrainTiles: Record<string, TerrainTileKind>,
  ) {
    this.kindIds = new Uint8Array(columns * rows);
    this.kindIds.fill(noneKindId);
    Object.entries(terrainTiles).forEach(([key, kind]) => {
      const kindId = kindIdByKind[kind];
      if (kindId === undefined) {
        return;
      }
      const [column, row] = keyToColumnRow(key);
      if (column < 0) {
        return;
      }
      if (row < 0) {
        return;
      }
      if (column >= this.columns) {
        return;
      }
      if (row >= this.rows) {
        return;
      }
      this.kindIds[this.index(column, row)] = kindId;
    });
  }

  public kindAt(column: number, row: number): TerrainTileKind | null {
    if (column < 0 || column >= this.columns) {
      return null;
    }
    if (row < 0 || row >= this.rows) {
      return null;
    }
    const id = this.kindIds[this.index(column, row)];
    if (id === noneKindId) {
      return null;
    }
    return idToKind[id] ?? null;
  }

  public setKindAt(column: number, row: number, kind: TerrainTileKind) {
    if (column < 0 || column >= this.columns) {
      return;
    }
    if (row < 0 || row >= this.rows) {
      return;
    }
    const kindId = kindIdByKind[kind];
    if (kindId === undefined) {
      return;
    }
    this.kindIds[this.index(column, row)] = kindId;
  }

  public clearKindAt(column: number, row: number) {
    if (column < 0 || column >= this.columns) {
      return;
    }
    if (row < 0 || row >= this.rows) {
      return;
    }
    this.kindIds[this.index(column, row)] = noneKindId;
  }

  private index(column: number, row: number) {
    return row * this.columns + column;
  }
}

const keyToColumnRow = (key: string): [number, number] => {
  const parts = key.split(",");
  const column = Number(parts[0] ?? "");
  const row = Number(parts[1] ?? "");
  if (!Number.isFinite(column) || !Number.isFinite(row)) {
    return [-1, -1];
  }
  return [column, row];
};

