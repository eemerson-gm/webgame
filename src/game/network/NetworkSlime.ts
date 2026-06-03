import * as ex from "excalibur";
import type { EntityPatch } from "../../classes/GameWire";
import { SlimeNetworkClient } from "../../classes/SlimeNetworkClient";
import type { GameClient } from "../../classes/GameClient";
import { Slime } from "../../actors/Slime";
import type { TileCollisionWorld } from "../../actors/MovingActor";
import { quantizePosition } from "./positionQuantize";
import { RemotePositionSync } from "./RemotePositionSync";

export class NetworkSlime extends Slime {
  private readonly network: SlimeNetworkClient | null;
  private readonly positionSync: RemotePositionSync;
  private readonly isAuthority: boolean;

  constructor(
    entityId: string,
    ownerId: string,
    pos: ex.Vector,
    tilemap: ex.TileMap,
    collisionWorld: TileCollisionWorld,
    client: GameClient | undefined,
    isAuthority: boolean,
  ) {
    super(entityId, ownerId, pos, tilemap, collisionWorld);
    this.isAuthority = isAuthority;
    this.network =
      isAuthority && client
        ? new SlimeNetworkClient(client, entityId)
        : null;
    this.positionSync = new RemotePositionSync(
      this,
      (position, snapDistance, correctionOptions) => {
        this.applyPositionCorrection(position, snapDistance, correctionOptions);
      },
    );
  }

  protected override onJumpStarted(): void {
    super.onJumpStarted();
    if (!this.network) {
      return;
    }
    this.network.onJump();
  }

  protected override onLand(): void {
    super.onLand();
    if (!this.network) {
      return;
    }
    const position = quantizePosition(this.pos.x, this.pos.y);
    this.network.onLanded(position.x, position.y);
  }

  protected override onWanderChanged(): void {
    super.onWanderChanged();
    if (!this.network) {
      return;
    }
    const position = quantizePosition(this.pos.x, this.pos.y);
    this.network.onWanderChanged({
      wanderSign: this.getWanderSign(),
      facingLeft: this.isFacingLeft(),
      isGrounded: this.isGrounded,
      x: position.x,
      y: position.y,
    });
  }

  public applyCombatPatch(patch: EntityPatch): void {
    if (patch.health !== undefined) {
      this.syncHealth(patch.health);
      if (this.health <= 0) {
        this.die();
        return;
      }
    }
    if (patch.knockbackFromLeft !== undefined) {
      this.knockBackFromFacing(patch.knockbackFromLeft);
    }
  }

  public applyRemoteSimulation(patch: EntityPatch): void {
    if (this.isAuthority) {
      return;
    }
    if (patch.wanderSign !== undefined) {
      this.setWanderSign(patch.wanderSign);
    }
    if (patch.facingLeft !== undefined) {
      this.setFacingLeft(patch.facingLeft);
    }
    if (patch.jump === true && !this.isJumping) {
      this.simulateJumpStart();
    }
    this.positionSync.applyPartial({ x: patch.x, y: patch.y });
  }

  public tickAuthority(frameDelta: number): void {
    if (!this.isAuthority || !this.network) {
      return;
    }
    this.tickWanderDecision(frameDelta);
    const position = quantizePosition(this.pos.x, this.pos.y);
    this.network.tickPositionBackup(frameDelta, position.x, position.y);
  }
}
