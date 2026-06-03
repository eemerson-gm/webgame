import { networkPositionBackupIntervalMs } from "../game/networkSyncConfig";
import type { GameClient } from "./GameClient";
import { messageTypes } from "./GameWire";

export type SlimeWanderSnapshot = {
  readonly wanderSign: number;
  readonly facingLeft: boolean;
  readonly isGrounded: boolean;
  readonly x: number;
  readonly y: number;
};

export class SlimeNetworkClient {
  private positionBackupElapsedMs: number = 0;

  constructor(
    private readonly client: GameClient,
    private readonly entityId: string,
  ) {}

  public onWanderChanged(snapshot: SlimeWanderSnapshot): void {
    const payload = {
      entityId: this.entityId,
      wanderSign: snapshot.wanderSign,
      facingLeft: snapshot.facingLeft,
    };
    if (snapshot.isGrounded) {
      this.sendImmediate({
        ...payload,
        x: snapshot.x,
        y: snapshot.y,
      });
      return;
    }
    this.sendImmediate(payload);
  }

  public onJump(): void {
    this.sendImmediate({
      entityId: this.entityId,
      jump: true,
    });
  }

  public onLanded(x: number, y: number): void {
    this.sendImmediate({
      entityId: this.entityId,
      x,
      y,
    });
  }

  public tickPositionBackup(delta: number, x: number, y: number): void {
    this.positionBackupElapsedMs += delta;
    if (this.positionBackupElapsedMs < networkPositionBackupIntervalMs) {
      return;
    }
    this.positionBackupElapsedMs =
      this.positionBackupElapsedMs % networkPositionBackupIntervalMs;
    this.sendImmediate({
      entityId: this.entityId,
      x,
      y,
    });
  }

  private sendImmediate(
    payload: {
      entityId: string;
      wanderSign?: number;
      facingLeft?: boolean;
      health?: number;
      x?: number;
      y?: number;
      jump?: boolean;
    },
  ): void {
    this.positionBackupElapsedMs = 0;
    this.client.send({
      type: messageTypes.updateEntity,
      payload,
    });
  }
}
