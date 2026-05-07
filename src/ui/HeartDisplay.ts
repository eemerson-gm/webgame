import * as ex from "excalibur";
import { Resources } from "../resource";

const heartCount = 3;
const heartOverlap = 1;

export class HeartDisplay {
  private readonly heartActors: ex.Actor[];

  constructor(pos: ex.Vector) {
    const size = this.heartSize();
    const heartSpacing = size.width - heartOverlap;
    
    this.heartActors = Array.from({ length: heartCount }, (_value, index) => {
      const actor = new ex.Actor({
        pos: ex.vec(pos.x + index * heartSpacing, pos.y),
        anchor: ex.vec(0, 0),
        width: size.width,
        height: size.height,
      });
      actor.graphics.anchor = ex.vec(0, 0);
      return actor;
    });
  }

  public getActors() {
    return this.heartActors;
  }

  public syncHearts(currentHealth: number) {
    this.heartActors.forEach((actor, index) => {
      actor.graphics.use(this.heartSpriteFor(currentHealth - index * 2));
    });
  }

  private heartSize() {
    const heartSprite = Resources.HeartFull.toSprite();
    return {
      width: heartSprite.width,
      height: heartSprite.height,
    };
  }

  private heartSpriteFor(heartHealth: number) {
    if (heartHealth >= 2) {
      return Resources.HeartFull.toSprite();
    }
    if (heartHealth >= 1) {
      return Resources.HeartHalf.toSprite();
    }
    return Resources.HeartEmpty.toSprite();
  }
}
