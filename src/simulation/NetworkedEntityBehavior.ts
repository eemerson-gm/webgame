import type { EntityState } from "../classes/GameProtocol";

export type NetworkedEntityProviders = {
  clientId: () => string;
  sendState: (state: EntityState) => void;
};

const ownerStateSyncIntervalMs = 200;
const unsettledFramesBeforeResumingSync = 4;

export class NetworkedEntityBehavior<TState extends EntityState> {
  private ownerStateSyncElapsedMs = 0;
  private hasSentSettledState = false;
  private unsettledFrameStreak = 0;

  constructor(private providers: NetworkedEntityProviders) {}

  public isOwnedByLocal(state: TState) {
    return state.ownerId === this.localClientId();
  }

  public localClientId() {
    return this.providers.clientId();
  }

  public syncOwnerStatePeriodically(
    delta: number,
    state: TState,
    isSettled: boolean = false,
  ) {
    if (!this.isOwnedByLocal(state)) {
      return;
    }
    if (isSettled) {
      this.unsettledFrameStreak = 0;
      if (this.hasSentSettledState) {
        return;
      }
      this.hasSentSettledState = true;
      this.ownerStateSyncElapsedMs = 0;
      this.providers.sendState(state);
      return;
    }
    if (!this.hasSentSettledState) {
      this.unsettledFrameStreak = 0;
    } else {
      this.unsettledFrameStreak += 1;
    }
    if (
      this.hasSentSettledState &&
      this.unsettledFrameStreak < unsettledFramesBeforeResumingSync
    ) {
      return;
    }
    this.hasSentSettledState = false;
    this.ownerStateSyncElapsedMs += delta;
    if (this.ownerStateSyncElapsedMs < ownerStateSyncIntervalMs) {
      return;
    }
    this.ownerStateSyncElapsedMs =
      this.ownerStateSyncElapsedMs % ownerStateSyncIntervalMs;
    this.providers.sendState(state);
  }
  
  public resetSettledState() {
    this.hasSentSettledState = false;
    this.unsettledFrameStreak = 0;
  }
}
