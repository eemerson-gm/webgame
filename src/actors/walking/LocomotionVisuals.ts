import type * as ex from "excalibur";

export type LocomotionVisual = "idle" | "walk" | "jump";

export type LocomotionVisualsHost = {
  setLocomotionVisual: (visual: LocomotionVisual, force?: boolean) => void;
  updateFacing: (facingLeft: boolean) => void;
  bodyGraphicCenter: () => ex.Vector;
  update: (delta: number) => void;
};
