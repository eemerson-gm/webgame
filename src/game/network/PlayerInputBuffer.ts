import type { PlayerInputSample } from "../../classes/PlayerNetworkClient";

export type BufferedInput = PlayerInputSample & {
  readonly sequence: number;
};

export class PlayerInputBuffer {
  private readonly pending: BufferedInput[] = [];

  public push(sequence: number, sample: PlayerInputSample) {
    this.pending.push({ sequence, ...sample });
  }

  public acknowledgeThrough(sequence: number) {
    while (this.pending.length > 0) {
      const head = this.pending[0];
      if (!head || head.sequence > sequence) {
        return;
      }
      this.pending.shift();
    }
  }

  public samples(): readonly BufferedInput[] {
    return this.pending;
  }
}
