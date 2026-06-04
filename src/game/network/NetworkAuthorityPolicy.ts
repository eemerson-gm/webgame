import {
  NetworkCorrectionController,
  type NetworkPositionSnapshot,
} from "./NetworkCorrectionController";

export interface NetworkAuthorityPolicy {
  applySnapshotPosition(snapshot: NetworkPositionSnapshot): void;
}

export class OwnerAuthoritativePolicy implements NetworkAuthorityPolicy {
  public applySnapshotPosition(_snapshot: NetworkPositionSnapshot): void {
    void _snapshot;
  }
}

export class ServerCorrectedPolicy implements NetworkAuthorityPolicy {
  constructor(private readonly correction: NetworkCorrectionController) {}

  public applySnapshotPosition(snapshot: NetworkPositionSnapshot): void {
    this.correction.applyServerCorrection(snapshot);
  }
}
