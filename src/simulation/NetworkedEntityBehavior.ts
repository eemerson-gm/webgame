import type { EntityState } from "../classes/GameProtocol";

export type NetworkedEntityProviders = {
  clientId: () => string;
  sendState: (state: EntityState) => void;
};

const ownerStateSyncIntervalMs = 200;

export class NetworkedEntityBehavior<TState extends EntityState> {
  private ownerStateSyncElapsedMs = 0;
  private hasSentSettledState = false;

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
      if (this.hasSentSettledState) {
        return;
      }
      this.hasSentSettledState = true;
      this.ownerStateSyncElapsedMs = 0;
      this.providers.sendState(state);
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
  }
}
