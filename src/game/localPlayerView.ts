import * as ex from "excalibur";
import type { Player } from "../actors/Player";
import type { PlayerHand } from "../combat/playerHands";
import { TILE_PX } from "../world/worldConfig";

const cameraFollowResponsiveness = 10;
const cameraSnapDistance = TILE_PX * 8;
const cameraPixelSnapScale = 3;

class SmoothCameraFollowStrategy {
  constructor(
    public readonly target: Player,
    private readonly responsiveness: number,
    private readonly snapDistance: number,
  ) {}

  public readonly action = (
    target: Player,
    camera: ex.Camera,
    _engine: ex.Engine,
    elapsed: number,
  ): ex.Vector => {
    const currentFocus = camera.getFocus();
    const targetFocus = target.cameraFocusPosition();
    if (currentFocus.distance(targetFocus) >= this.snapDistance) {
      return this.snapCameraFocus(targetFocus);
    }
    const blend =
      1 - Math.exp((-this.responsiveness * Math.max(elapsed, 0)) / 1000);
    return this.snapCameraFocus(
      currentFocus.add(targetFocus.sub(currentFocus).scale(blend)),
    );
  };

  private snapCameraFocus(focus: ex.Vector) {
    return ex.vec(
      Math.round(focus.x * cameraPixelSnapScale) / cameraPixelSnapScale,
      Math.round(focus.y * cameraPixelSnapScale) / cameraPixelSnapScale,
    );
  }
}

export class LocalPlayerView {
  constructor(private readonly player: Player) {}

  public attach(engine: ex.Engine, onAttackHand: (hand: PlayerHand) => void): void {
    if (!this.player.scene) {
      return;
    }
    const worldBounds = this.player.worldPixelBounds();
    this.player.scene.camera.addStrategy(
      new SmoothCameraFollowStrategy(
        this.player,
        cameraFollowResponsiveness,
        cameraSnapDistance,
      ),
    );
    this.player.scene.camera.strategy.limitCameraBounds(worldBounds);
    engine.input.pointers.primary.on("down", (evt) => {
      if (evt.button === ex.PointerButton.Right) {
        onAttackHand("handRight");
        return;
      }
      if (evt.button === ex.PointerButton.Left) {
        onAttackHand("handLeft");
      }
    });
    engine.canvas.addEventListener("contextmenu", (event) => {
      event.preventDefault();
    });
  }
}
