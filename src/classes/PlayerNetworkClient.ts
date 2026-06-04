import type { GameClient } from "./GameClient";
import { messageTypes, type PlayerInputPayload } from "./GameWire";

export type PlayerInputSample = Omit<PlayerInputPayload, "sequence">;

export class PlayerNetworkClient {
  private nextSequence: number = 0;

  constructor(private client?: GameClient) {}

  public hasClient(): boolean {
    return this.client !== undefined;
  }

  public sendInput(sample: PlayerInputSample): number {
    if (!this.client) {
      return 0;
    }
    this.nextSequence += 1;
    const sequence = this.nextSequence;
    this.client.send({
      type: messageTypes.playerInput,
      payload: {
        sequence,
        ...sample,
      },
    });
    return sequence;
  }
}
