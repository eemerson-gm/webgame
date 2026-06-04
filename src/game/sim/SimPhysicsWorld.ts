import type { TerrainTileKind } from "../../classes/GameWire";
import { isSolidTerrainTileKind } from "../../classes/TerrainTileKinds";
import type { TileCollisionWorld } from "../../physics/entityPhysics";
import { TILE_PX } from "../../world/worldConfig";

export class SimPhysicsWorld implements TileCollisionWorld {
  public readonly tileWidth = TILE_PX;
  public readonly tileHeight = TILE_PX;

  private readonly solidKeys: ReadonlySet<string>;

  constructor(
    public readonly columns: number,
    public readonly rows: number,
    terrainTiles: Record<string, TerrainTileKind>,
  ) {
    this.solidKeys = new Set(
      Object.entries(terrainTiles)
        .filter(([, kind]) => isSolidTerrainTileKind(kind))
        .map(([key]) => key),
    );
  }

  public isSolidTile(column: number, row: number): boolean {
    if (column < 0 || row < 0 || column >= this.columns || row >= this.rows) {
      return false;
    }
    return this.solidKeys.has(`${column},${row}`);
  }
}
