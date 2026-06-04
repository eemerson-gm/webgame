import type { Engine } from "excalibur";
import * as ex from "excalibur";
import type {
  AuthoritativeEntitySnapshot,
  EntityPatch,
} from "../../classes/GameWire";
import { Slime } from "../../actors/Slime";
import type { TileCollisionWorld } from "../../actors/MovingActor";
import { ServerCorrectedPolicy } from "./NetworkAuthorityPolicy";
import { NetworkCorrectionController } from "./NetworkCorrectionController";
import { SimulationDriftDiagnostics } from "../sim/SimulationDriftDiagnostics";
import type { SimulationHashFields } from "../sim/SimulationStateHash";

const driftDiagnostics = new SimulationDriftDiagnostics();

export class NetworkSlime extends Slime {
  private readonly serverAuthority: ServerCorrectedPolicy;
  private lastServerTick = 0;

  constructor(
    entityId: string,
    ownerId: string,
    pos: ex.Vector,
    tilemap: ex.TileMap,
    collisionWorld: TileCollisionWorld,
  ) {
    super(entityId, ownerId, pos, tilemap, collisionWorld);
    this.serverAuthority = new ServerCorrectedPolicy(
      new NetworkCorrectionController(this),
    );
  }

  public applyAuthoritativeSnapshot(snapshot: AuthoritativeEntitySnapshot): void {
    if (snapshot.wanderSign !== undefined) {
      this.setWanderSign(snapshot.wanderSign);
    }
    if (snapshot.facingLeft !== undefined) {
      this.setFacingLeft(snapshot.facingLeft);
    }
    if (snapshot.health !== undefined) {
      this.syncHealth(snapshot.health);
      if (this.health <= 0) {
        this.die();
        return;
      }
    }
    if (snapshot.x === undefined || snapshot.y === undefined) {
      return;
    }
    const localHash: SimulationHashFields = {
      x: this.pos.x,
      y: this.pos.y,
      horizontalSpeed: this.hspeed,
      verticalSpeed: this.vspeed,
      isGrounded: this.isGrounded,
      isJumping: this.isJumping,
      health: this.health,
      wanderSign: this.getWanderSign(),
    };
    const remoteHash: SimulationHashFields = {
      x: snapshot.x,
      y: snapshot.y,
      horizontalSpeed: 0,
      verticalSpeed: 0,
      isGrounded: localHash.isGrounded,
      isJumping: localHash.isJumping,
      health: snapshot.health,
      wanderSign: snapshot.wanderSign,
    };
    driftDiagnostics.checkEntity(
      this.entityId(),
      this.lastServerTick,
      localHash,
      remoteHash,
    );
    this.serverAuthority.applySnapshotPosition({
      x: snapshot.x,
      y: snapshot.y,
    });
    this.syncLocomotionVisuals(this.getWanderSign());
  }

  public applyWorldSnapshotTick(tick: number): void {
    this.lastServerTick = tick;
  }

  public applyCombatPatch(patch: EntityPatch): void {
    this.applyAuthoritativeSnapshot(patch as AuthoritativeEntitySnapshot);
  }

  public applyRemoteSimulation(patch: EntityPatch): void {
    this.applyAuthoritativeSnapshot(patch as AuthoritativeEntitySnapshot);
  }

  override onPostUpdate(_engine: Engine, delta: number): void {
    super.onPostUpdate(_engine, delta);
  }
}
