import * as ex from "excalibur";
import { Resources } from "../resource";
import { ParticleActor } from "./ParticleActor";

const smashFrameDurationMs = 45;

export class SmashParticleActor extends ParticleActor {
  constructor(pos: ex.Vector) {
    super({
      pos,
      frames: [
        Resources.Smash1.toSprite(),
        Resources.Smash2.toSprite(),
        Resources.Smash3.toSprite(),
        Resources.Smash4.toSprite(),
      ],
      frameDurationMs: smashFrameDurationMs,
      z: 13,
    });
  }
}
