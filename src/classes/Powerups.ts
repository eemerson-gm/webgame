import * as ex from "excalibur";
import { Resources } from "../resource";
import {
  AttachedVisualAnimation,
  type AttachedVisualPose,
} from "./AttachedVisualAnimation";

const walkFrameDurationMs = 120;
const actionFrameDurationMs = 75;
const minerPowerupDurationMs = 30000;

type ResourceKey = Exclude<keyof typeof Resources, "GameFont">;
type PowerupFrame = {
  sprite: ResourceKey;
};
export type PowerupBehavior = "mine";
export type PowerupAction = "blockBreak" | "activeUse";

export type HatPose = {
  offset: ex.Vector;
  visible?: boolean;
};

export type PowerupHatPoses = {
  idle?: HatPose;
  jump?: HatPose;
  crouch?: HatPose;
  walk?: readonly HatPose[];
  actions?: Partial<Record<PowerupAction, readonly HatPose[]>>;
};

export type PowerupHatVisual = {
  sprite: ex.Sprite;
  poses: PowerupHatPoses;
};

type PowerupActionDefinition = {
  frames: readonly PowerupFrame[];
  frameDurationMs: number;
  attachment?: {
    sprite: ResourceKey;
    poses: readonly AttachedVisualPose[];
  };
};

type PowerupDefinition = {
  behaviors: readonly PowerupBehavior[];
  toolbarIcon: ResourceKey;
  slotColor: ex.Color;
  durationMs: number;
  breakDurationMultiplier: number;
  body: {
    idle: PowerupFrame;
    jump: PowerupFrame;
    crouch: PowerupFrame;
    walk: {
      frames: readonly PowerupFrame[];
      frameDurationMs: number;
    };
  };
  hat?: {
    sprite: ResourceKey;
    poses: PowerupHatPoses;
  };
  actions: {
    blockBreak: PowerupActionDefinition;
    activeUse?: PowerupActionDefinition;
  };
};

export type PowerupActionVisuals = Partial<
  Record<PowerupAction, AttachedVisualAnimation>
> & {
  blockBreak: AttachedVisualAnimation;
};

export type PowerupVisuals = {
  toolbarIcon: ex.Sprite;
  idleSprite: ex.Sprite;
  jumpSprite: ex.Sprite;
  crouchSprite: ex.Sprite;
  walkAnimation: ex.Animation;
  walkFrameDurationMs: number;
  walkFrameCount: number;
  hat?: PowerupHatVisual;
  actions: PowerupActionVisuals;
};

const defaultWalkFrames = [
  { sprite: "PlayerWalk1" },
  { sprite: "PlayerWalk2" },
] as const;

const defaultToolActionFrames = [
  { sprite: "PlayerUseTool1" },
  { sprite: "PlayerUseTool2" },
  { sprite: "PlayerUseTool3" },
  { sprite: "PlayerUseTool4" },
  { sprite: "PlayerUseTool5" },
] as const;

const minerHatWalkPoses = [
  { offset: ex.vec(0, 5) },
  { offset: ex.vec(0, 6) },
] as const satisfies readonly HatPose[];

const minerHatBlockBreakPoses = [
  { offset: ex.vec(0, 5) },
  { offset: ex.vec(0, 5) },
  { offset: ex.vec(1, 5) },
  { offset: ex.vec(1, 6) },
  { offset: ex.vec(0, 6) },
] as const satisfies readonly HatPose[];

const defaultPunchFrames = [
  { sprite: "PlayerPunch1" },
  { sprite: "PlayerPunch2" },
  { sprite: "PlayerPunch3" },
] as const;

const toolAttachmentPoses = [
  {
    offset: ex.vec(12, 8),
    rotation: -0.9,
  },
  {
    offset: ex.vec(14, 10),
    rotation: -0.45,
  },
  {
    offset: ex.vec(14, 12),
    rotation: 0.35,
  },
  {
    offset: ex.vec(14, 12),
    rotation: 0.75,
  },
  {
    offset: ex.vec(13, 12),
    rotation: 0.75,
  },
] as const satisfies readonly AttachedVisualPose[];

const powerupDefinitionsConfig = {
  none: {
    behaviors: [],
    toolbarIcon: "NonePowerupIcon",
    slotColor: ex.Color.fromHex("#9c8bdb"),
    durationMs: 0,
    breakDurationMultiplier: 3,
    body: {
      idle: { sprite: "Player" },
      jump: { sprite: "PlayerJump" },
      crouch: { sprite: "PlayerCrouch" },
      walk: {
        frames: defaultWalkFrames,
        frameDurationMs: walkFrameDurationMs,
      },
    },
    actions: {
      blockBreak: {
        frames: defaultPunchFrames,
        frameDurationMs: actionFrameDurationMs,
      },
    },
  },
  miner: {
    behaviors: ["mine"],
    toolbarIcon: "MinerPowerupIcon",
    slotColor: ex.Color.fromHex("#d9a441"),
    durationMs: minerPowerupDurationMs,
    breakDurationMultiplier: 1,
    body: {
      idle: { sprite: "Player" },
      jump: { sprite: "PlayerJump" },
      crouch: { sprite: "PlayerCrouch" },
      walk: {
        frames: defaultWalkFrames,
        frameDurationMs: walkFrameDurationMs,
      },
    },
    hat: {
      sprite: "MinerHat",
      poses: {
        idle: { offset: ex.vec(0, 5) },
        jump: { offset: ex.vec(0, 5) },
        crouch: { offset: ex.vec(0, 7) },
        walk: minerHatWalkPoses,
        actions: {
          blockBreak: minerHatBlockBreakPoses,
        },
      },
    },
    actions: {
      blockBreak: {
        frames: defaultToolActionFrames,
        frameDurationMs: actionFrameDurationMs,
        attachment: {
          sprite: "BronzePickaxe",
          poses: toolAttachmentPoses,
        },
      },
    },
  },
} as const satisfies Record<string, PowerupDefinition>;

export type PlayerPowerup = keyof typeof powerupDefinitionsConfig;

export const powerupDefinitions: Record<PlayerPowerup, PowerupDefinition> =
  powerupDefinitionsConfig;

export const powerupIds = Object.keys(
  powerupDefinitionsConfig,
) as PlayerPowerup[];

const spriteFor = (spriteKey: ResourceKey) => Resources[spriteKey].toSprite();

const spriteForFrame = (frame: PowerupFrame) => {
  const sprite = spriteFor(frame.sprite);
  sprite.origin = ex.vec(sprite.width / 2, sprite.height / 2);
  return sprite;
};

const animationFor = (
  frameKeys: readonly PowerupFrame[],
  frameDurationMs: number,
) =>
  new ex.Animation({
    frames: frameKeys.map((frame) => ({
      graphic: spriteForFrame(frame),
    })),
    frameDuration: frameDurationMs,
    strategy: ex.AnimationStrategy.Loop,
  });

const actionAnimationFor = (
  action: PowerupActionDefinition,
  attachmentActor: ex.Actor,
  mirrorWidth: number,
  onFrame: () => void,
) =>
  new AttachedVisualAnimation({
    frames: action.frames.map((frame, index) => ({
      graphic: spriteForFrame(frame),
      attachment:
        action.attachment?.poses[index] ?? action.attachment?.poses[0],
    })),
    frameDurationMs: action.frameDurationMs,
    attachmentActor,
    attachmentSprite: action.attachment
      ? spriteFor(action.attachment.sprite)
      : undefined,
    mirrorWidth,
    strategy: ex.AnimationStrategy.Loop,
    onFrame,
  });

export const isPlayerPowerup = (value: unknown): value is PlayerPowerup =>
  typeof value === "string" && powerupIds.includes(value as PlayerPowerup);

export const powerupDefinitionFor = (powerup: PlayerPowerup) =>
  powerupDefinitions[powerup];

export const powerupHasBehavior = (
  powerup: PlayerPowerup,
  behavior: PowerupBehavior,
) => powerupDefinitionFor(powerup).behaviors.includes(behavior);

export const powerupToolbarIconFor = (powerup: PlayerPowerup) =>
  spriteFor(powerupDefinitionFor(powerup).toolbarIcon);

export const powerupSlotColorFor = (powerup: PlayerPowerup) =>
  powerupDefinitionFor(powerup).slotColor;

export const powerupDurationMsFor = (powerup: PlayerPowerup) =>
  powerupDefinitionFor(powerup).durationMs;

export const powerupBreakDurationMultiplierFor = (powerup: PlayerPowerup) =>
  powerupDefinitionFor(powerup).breakDurationMultiplier;

export const powerupVisualsFor = (
  powerup: PlayerPowerup,
  attachmentActor: ex.Actor,
  mirrorWidth: number,
  onActionFrame: () => void,
): PowerupVisuals => {
  const definition = powerupDefinitionFor(powerup);
  const activeUse = definition.actions.activeUse;
  return {
    toolbarIcon: spriteFor(definition.toolbarIcon),
    idleSprite: spriteForFrame(definition.body.idle),
    jumpSprite: spriteForFrame(definition.body.jump),
    crouchSprite: spriteForFrame(definition.body.crouch),
    walkAnimation: animationFor(
      definition.body.walk.frames,
      definition.body.walk.frameDurationMs,
    ),
    walkFrameDurationMs: definition.body.walk.frameDurationMs,
    walkFrameCount: definition.body.walk.frames.length,
    hat: definition.hat
      ? {
          sprite: spriteFor(definition.hat.sprite),
          poses: definition.hat.poses,
        }
      : undefined,
    actions: {
      blockBreak: actionAnimationFor(
        definition.actions.blockBreak,
        attachmentActor,
        mirrorWidth,
        onActionFrame,
      ),
      ...(activeUse
        ? {
            activeUse: actionAnimationFor(
              activeUse,
              attachmentActor,
              mirrorWidth,
              onActionFrame,
            ),
          }
        : {}),
    },
  };
};
