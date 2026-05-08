import * as ex from "excalibur";
import { Resources } from "../resource";
import minerBlockBreakAnimationData from "../data/animations/miner-block-break.json";
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

type JsonVector = {
  x: number;
  y: number;
};

type JsonHatPose = {
  offset: JsonVector;
  visible?: boolean;
};

type JsonAttachedVisualPose = {
  offset: JsonVector;
  rotation: number;
  visible?: boolean;
};

type MinerBlockBreakAnimationData = {
  id: string;
  hat: {
    sprite: ResourceKey;
    poses: {
      idle?: JsonHatPose;
      jump?: JsonHatPose;
      crouch?: JsonHatPose;
      walk?: readonly JsonHatPose[];
      actions?: Partial<Record<PowerupAction, readonly JsonHatPose[]>>;
    };
  };
  action: {
    frames: readonly PowerupFrame[];
    frameDurationMs: number;
    attachment?: {
      sprite: ResourceKey;
      poses: readonly JsonAttachedVisualPose[];
    };
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

const defaultPunchFrames = [
  { sprite: "PlayerPunch1" },
  { sprite: "PlayerPunch2" },
  { sprite: "PlayerPunch3" },
] as const;

const minerBlockBreakAnimation =
  minerBlockBreakAnimationData as MinerBlockBreakAnimationData;

const vectorFromJson = (vector: JsonVector) => ex.vec(vector.x, vector.y);

const hatPoseFromJson = (pose: JsonHatPose): HatPose => ({
  offset: vectorFromJson(pose.offset),
  ...(pose.visible === undefined ? {} : { visible: pose.visible }),
});

const hatPosesFromJson = (
  poses: MinerBlockBreakAnimationData["hat"]["poses"],
): PowerupHatPoses => ({
  idle: poses.idle ? hatPoseFromJson(poses.idle) : undefined,
  jump: poses.jump ? hatPoseFromJson(poses.jump) : undefined,
  crouch: poses.crouch ? hatPoseFromJson(poses.crouch) : undefined,
  walk: poses.walk?.map((pose) => hatPoseFromJson(pose)),
  actions: poses.actions
    ? (Object.fromEntries(
        Object.entries(poses.actions).map(([action, actionPoses]) => [
          action,
          actionPoses.map((pose) => hatPoseFromJson(pose)),
        ]),
      ) as Partial<Record<PowerupAction, readonly HatPose[]>>)
    : undefined,
});

const actionPoseFromJson = (pose: JsonAttachedVisualPose): AttachedVisualPose => ({
  offset: vectorFromJson(pose.offset),
  rotation: pose.rotation,
  ...(pose.visible === undefined ? {} : { visible: pose.visible }),
});

const actionDefinitionFromJson = (
  action: MinerBlockBreakAnimationData["action"],
): PowerupActionDefinition => ({
  frames: action.frames,
  frameDurationMs: action.frameDurationMs,
  attachment: action.attachment
    ? {
        sprite: action.attachment.sprite,
        poses: action.attachment.poses.map((pose) => actionPoseFromJson(pose)),
      }
    : undefined,
});

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
      sprite: minerBlockBreakAnimation.hat.sprite,
      poses: hatPosesFromJson(minerBlockBreakAnimation.hat.poses),
    },
    actions: {
      blockBreak: actionDefinitionFromJson(minerBlockBreakAnimation.action),
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
