import type { GameClient } from "./GameClient";
import { messageTypes, type PlayerState } from "./GameWire";

const positionBackupIntervalMs = 75;

export type PlayerNetworkSnapshot = {
  readonly keyLeft: boolean;
  readonly keyRight: boolean;
  readonly keyJump: boolean;
  readonly keyDown: boolean;
  readonly facingLeft: boolean;
  readonly isGrounded: boolean;
  readonly x: number;
  readonly y: number;
  readonly horizontalSpeed: number;
  readonly verticalSpeed: number;
  readonly attackCycle: number;
};

export type PlayerPauseSnapshot = {
  readonly isPaused: boolean;
  readonly x: number;
  readonly y: number;
};

export class PlayerNetworkClient {
  private positionBackupElapsedMs: number = 0;

  constructor(private client?: GameClient) {}

  public onInputChanged(snapshot: PlayerNetworkSnapshot): void {
    const keysPayload: PlayerState = {
      keyLeft: snapshot.keyLeft,
      keyRight: snapshot.keyRight,
      keyJump: snapshot.keyJump,
      keyDown: snapshot.keyDown,
      facingLeft: snapshot.facingLeft,
      attackCycle: snapshot.attackCycle,
    };
    if (snapshot.isGrounded) {
      this.sendImmediate({
        ...keysPayload,
        x: snapshot.x,
        y: snapshot.y,
        horizontalSpeed: snapshot.horizontalSpeed,
        verticalSpeed: snapshot.verticalSpeed,
      });
      return;
    }
    this.sendImmediate(keysPayload);
  }

  public onJump(): void {
    this.sendImmediate({ keyJump: true });
  }

  public onAttack(attackCycle: number, facingLeft: boolean): void {
    this.sendImmediate({
      keyAttack: true,
      attackCycle,
      facingLeft,
    });
  }

  public onLanded(x: number, y: number): void {
    this.sendImmediate({ x, y });
  }

  public onPaused(snapshot: PlayerPauseSnapshot): void {
    this.sendImmediate({
      isPaused: snapshot.isPaused,
      keyLeft: false,
      keyRight: false,
      keyJump: false,
      keyDown: false,
      horizontalSpeed: 0,
      verticalSpeed: 0,
      x: snapshot.x,
      y: snapshot.y,
    });
  }

  public tickPositionBackup(delta: number, x: number, y: number): void {
    if (!this.client) {
      return;
    }
    this.positionBackupElapsedMs += delta;
    if (this.positionBackupElapsedMs < positionBackupIntervalMs) {
      return;
    }
    this.positionBackupElapsedMs =
      this.positionBackupElapsedMs % positionBackupIntervalMs;
    this.sendImmediate({ x, y });
  }

  private sendImmediate(payload: PlayerState, statePatch?: PlayerState): void {
    if (!this.client) {
      return;
    }
    this.positionBackupElapsedMs = 0;
    const message: {
      type: typeof messageTypes.updatePlayer;
      payload: PlayerState;
      statePatch?: PlayerState;
    } = {
      type: messageTypes.updatePlayer,
      payload,
    };
    if (statePatch !== undefined) {
      message.statePatch = statePatch;
    }
    this.client.send(message);
  }
}
