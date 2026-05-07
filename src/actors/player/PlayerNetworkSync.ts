import type { GameClient } from "../../classes/GameClient";
import { messageTypes } from "../../classes/GameProtocol";
import type { Data } from "../../classes/GameProtocol";

const serverMovementSyncIntervalMs = 75;
const serverKnockbackMovementSyncIntervalMs = 50;
const serverPeerMovementCorrectionIntervalMs = 100;
const serverMovementPositionThreshold = 0.5;
const serverMovementSpeedThreshold = 0.05;

export type PlayerMovementState = {
  x: number;
  y: number;
  horizontalSpeed: number;
  verticalSpeed: number;
  isFlying: boolean;
};

export class PlayerNetworkSync {
  private serverMovementSyncElapsedMs: number = 0;
  private serverPeerMovementSyncElapsedMs: number = 0;
  private lastServerMovementState?: PlayerMovementState;
  private shouldBroadcastSeparatedPosition: boolean = false;
  
  constructor(private client?: GameClient) {}
  
  public setShouldBroadcastSeparatedPosition(value: boolean) {
    this.shouldBroadcastSeparatedPosition = value;
  }
  
  public markPositionChanged() {
    this.lastServerMovementState = undefined;
  }
  
  public sendUpdate(payload: Data, statePatch?: Data) {
    if (!this.client) return;
    this.client.send(messageTypes.updatePlayer, payload, statePatch);
  }
  
  public syncMovementPeriodically(
    delta: number,
    currentState: PlayerMovementState,
    shouldBroadcastMovement: boolean = false,
  ) {
    if (!this.client) {
      return;
    }
    this.serverMovementSyncElapsedMs += delta;
    this.serverPeerMovementSyncElapsedMs += delta;
    const syncIntervalMs = shouldBroadcastMovement
      ? serverKnockbackMovementSyncIntervalMs
      : serverMovementSyncIntervalMs;
    if (this.serverMovementSyncElapsedMs < syncIntervalMs) {
      return;
    }
    this.serverMovementSyncElapsedMs =
      this.serverMovementSyncElapsedMs % syncIntervalMs;
      
    if (!this.shouldSyncMovementState(currentState)) {
      return;
    }
    const shouldBroadcastPeerCorrection =
      this.serverPeerMovementSyncElapsedMs >=
      serverPeerMovementCorrectionIntervalMs;
    const shouldBroadcastToPeers =
      shouldBroadcastMovement ||
      this.shouldBroadcastSeparatedPosition ||
      shouldBroadcastPeerCorrection;
    if (shouldBroadcastToPeers) {
      this.serverPeerMovementSyncElapsedMs =
        this.serverPeerMovementSyncElapsedMs %
        serverPeerMovementCorrectionIntervalMs;
    }
    this.lastServerMovementState = currentState;
    this.shouldBroadcastSeparatedPosition = false;
    const payload = shouldBroadcastToPeers ? currentState : {};
    const statePatch = shouldBroadcastToPeers ? undefined : currentState;
    this.sendUpdate(payload, statePatch);
  }

  private shouldSyncMovementState(movementState: PlayerMovementState) {
    const lastMovementState = this.lastServerMovementState;
    if (!lastMovementState) {
      return true;
    }
    if (
      Math.abs(movementState.x - lastMovementState.x) >=
      serverMovementPositionThreshold
    ) {
      return true;
    }
    if (
      Math.abs(movementState.y - lastMovementState.y) >=
      serverMovementPositionThreshold
    ) {
      return true;
    }
    if (
      Math.abs(
        movementState.horizontalSpeed -
          lastMovementState.horizontalSpeed,
      ) >= serverMovementSpeedThreshold
    ) {
      return true;
    }
    if (
      Math.abs(
        movementState.verticalSpeed -
          lastMovementState.verticalSpeed,
      ) >= serverMovementSpeedThreshold
    ) {
      return true;
    }
    return movementState.isFlying !== lastMovementState.isFlying;
  }
}
