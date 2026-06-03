import type { EntityPatch } from "../../classes/GameWire";
import {
  SlimeNetworkClient,
  type SlimeWanderSnapshot,
} from "../../classes/SlimeNetworkClient";
import type { GameClient } from "../../classes/GameClient";
import type { Slime } from "../../actors/Slime";
import { quantizePosition } from "./positionQuantize";
import { RemotePositionSync } from "./RemotePositionSync";

class SlimeOutboundTracker {
  private wasGrounded = true;
  private wasJumping = false;
  private wanderSign = 0;

  public publish(slime: Slime, network: SlimeNetworkClient): void {
    if (slime.isJumping && !this.wasJumping && slime.vspeed < 0) {
      network.onJump();
    }
    if (slime.isGrounded && !this.wasGrounded) {
      const position = quantizePosition(slime.pos.x, slime.pos.y);
      network.onLanded(position.x, position.y);
    }
    if (slime.getWanderSign() !== this.wanderSign) {
      network.onWanderChanged(this.wanderSnapshot(slime));
    }
    this.wasGrounded = slime.isGrounded;
    this.wasJumping = slime.isJumping;
    this.wanderSign = slime.getWanderSign();
  }

  private wanderSnapshot(slime: Slime): SlimeWanderSnapshot {
    const position = quantizePosition(slime.pos.x, slime.pos.y);
    return {
      wanderSign: slime.getWanderSign(),
      facingLeft: slime.isFacingLeft(),
      isGrounded: slime.isGrounded,
      x: position.x,
      y: position.y,
    };
  }
}

export class SlimeNetworkSync {
  private readonly network: SlimeNetworkClient | null;
  private readonly outbound = new SlimeOutboundTracker();
  private readonly positionSync: RemotePositionSync;

  constructor(
    private readonly slime: Slime,
    client: GameClient | undefined,
    private readonly isAuthority: boolean,
  ) {
    this.network =
      isAuthority && client
        ? new SlimeNetworkClient(client, slime.entityId())
        : null;
    this.positionSync = new RemotePositionSync(
      this.slime,
      (position, snapDistance, correctionOptions) => {
        this.slime.applyPositionCorrection(
          position,
          snapDistance,
          correctionOptions,
        );
      },
    );
  }

  public applyCombatPatch(patch: EntityPatch): void {
    if (patch.health !== undefined) {
      this.slime.syncHealth(patch.health);
      if (this.slime.health <= 0) {
        this.slime.die();
        return;
      }
    }
    if (patch.knockbackFromLeft !== undefined) {
      this.slime.knockBackFromFacing(patch.knockbackFromLeft);
    }
  }

  public applyRemoteSimulation(patch: EntityPatch): void {
    if (this.isAuthority) {
      return;
    }
    if (patch.wanderSign !== undefined) {
      this.slime.setWanderSign(patch.wanderSign);
    }
    if (patch.facingLeft !== undefined) {
      this.slime.setFacingLeft(patch.facingLeft);
    }
    if (patch.jump === true && !this.slime.isJumping) {
      this.slime.simulateJumpStart();
    }
    this.positionSync.applyPartial({ x: patch.x, y: patch.y });
  }

  public tickAuthority(frameDelta: number): void {
    if (!this.isAuthority || !this.network) {
      return;
    }
    this.slime.tickWanderDecision(frameDelta);
    this.outbound.publish(this.slime, this.network);
    const position = quantizePosition(this.slime.pos.x, this.slime.pos.y);
    this.network.tickPositionBackup(frameDelta, position.x, position.y);
  }
}
