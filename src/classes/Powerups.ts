import * as ex from "excalibur";
import { Resources } from "../resource";
import minerPowerupAnimationData from "../data/animations/miner-powerup.json";
import playerNoPowerupAnimationData from "../data/animations/player-no-powerup.json";
import {
  AttachedVisualAnimation,
  type AttachedVisualAttachment,
  type AttachedVisualHitbox,
  type AttachedVisualPose,
} from "./AttachedVisualAnimation";

const walkFrameDurationMs = 120;
const minerPowerupDurationMs = 30000;

type ResourceKey = Exclude<keyof typeof Resources, "GameFont">;
type PowerupFrame = {
  sprite: ResourceKey;
};
export type PowerupBehavior = "mine";
export type PowerupAction = "blockBreak" | "activeUse";

type PowerupAnimationTrack = {
  frames: readonly PowerupFrame[];
  frameDurationMs: number;
};

export type HatPose = {
  offset: ex.Vector;
  visible?: boolean;
};

export type PowerupHatPoses = {
  idle?: readonly HatPose[];
  jump?: readonly HatPose[];
  crouch?: readonly HatPose[];
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
  baseDamage: number;
  hitboxes?: readonly (readonly AttachedVisualHitbox[])[];
  attachments?: readonly {
    id: string;
    sprite: ResourceKey;
    layer: number;
    poses: readonly AttachedVisualPose[];
  }[];
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

type JsonAttachedVisualHitbox = {
  offset: JsonVector;
  width: number;
  height: number;
};

type MinerPowerupAnimationData = {
  id: string;
  body: {
    idle: PowerupAnimationTrack;
    jump: PowerupAnimationTrack;
    crouch: PowerupAnimationTrack;
    walk: PowerupAnimationTrack;
  };
  hat: {
    poses: {
      idle?: readonly JsonHatPose[];
      jump?: readonly JsonHatPose[];
      crouch?: readonly JsonHatPose[];
      walk?: readonly JsonHatPose[];
      actions?: Partial<Record<PowerupAction, readonly JsonHatPose[]>>;
    };
  };
  actions: Partial<Record<PowerupAction, JsonPowerupActionDefinition>> & {
    blockBreak: JsonPowerupActionDefinition;
  };
};

type PlayerNoPowerupAnimationData = {
  id: string;
  actions: {
    blockBreak: JsonPowerupActionDefinition;
  };
};

type JsonPowerupActionDefinition = PowerupAnimationTrack & {
  baseDamage?: number;
  hitboxes?: readonly (readonly JsonAttachedVisualHitbox[])[];
  attachments?: readonly {
    id: string;
    sprite: ResourceKey;
    layer: number;
    poses: readonly JsonAttachedVisualPose[];
  }[];
};

type PowerupDefinition = {
  behaviors: readonly PowerupBehavior[];
  toolbarIcon: ResourceKey;
  slotColor: ex.Color;
  durationMs: number;
  breakDurationMultiplier: number;
  body: {
    idle: PowerupAnimationTrack;
    jump: PowerupAnimationTrack;
    crouch: PowerupAnimationTrack;
    walk: PowerupAnimationTrack;
  };
  hat?: {
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
  idleAnimation: ex.Animation;
  jumpAnimation: ex.Animation;
  crouchAnimation: ex.Animation;
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

const defaultBody = {
  idle: {
    frames: [{ sprite: "Player" }],
    frameDurationMs: walkFrameDurationMs,
  },
  jump: {
    frames: [{ sprite: "PlayerJump" }],
    frameDurationMs: walkFrameDurationMs,
  },
  crouch: {
    frames: [{ sprite: "PlayerCrouch" }],
    frameDurationMs: walkFrameDurationMs,
  },
  walk: {
    frames: defaultWalkFrames,
    frameDurationMs: walkFrameDurationMs,
  },
} as const satisfies PowerupDefinition["body"];

const minerBlockBreakAnimation =
  minerPowerupAnimationData as MinerPowerupAnimationData;
const playerNoPowerupAnimation =
  playerNoPowerupAnimationData as PlayerNoPowerupAnimationData;

const vectorFromJson = (vector: JsonVector) => ex.vec(vector.x, vector.y);

const hatPoseFromJson = (pose: JsonHatPose): HatPose => ({
  offset: vectorFromJson(pose.offset),
  ...(pose.visible === undefined ? {} : { visible: pose.visible }),
});

const hatPosesFromJson = (
  poses: MinerPowerupAnimationData["hat"]["poses"],
): PowerupHatPoses => ({
  idle: poses.idle?.map((pose) => hatPoseFromJson(pose)),
  jump: poses.jump?.map((pose) => hatPoseFromJson(pose)),
  crouch: poses.crouch?.map((pose) => hatPoseFromJson(pose)),
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

const actionPoseFromJson = (
  pose: JsonAttachedVisualPose,
): AttachedVisualPose => ({
  offset: vectorFromJson(pose.offset),
  rotation: pose.rotation,
  ...(pose.visible === undefined ? {} : { visible: pose.visible }),
});

const actionHitboxFromJson = (
  hitbox: JsonAttachedVisualHitbox,
): AttachedVisualHitbox => ({
  offset: vectorFromJson(hitbox.offset),
  width: hitbox.width,
  height: hitbox.height,
});

const actionDefinitionFromJson = (
  action: JsonPowerupActionDefinition,
): PowerupActionDefinition => ({
  frames: action.frames,
  frameDurationMs: action.frameDurationMs,
  baseDamage: action.baseDamage ?? 0,
  hitboxes: action.hitboxes?.map((frameHitboxes) =>
    frameHitboxes.map((hitbox) => actionHitboxFromJson(hitbox)),
  ),
  attachments: action.attachments?.map((attachment) => ({
    id: attachment.id,
    sprite: attachment.sprite,
    layer: attachment.layer,
    poses: attachment.poses.map((pose) => actionPoseFromJson(pose)),
  })),
});

const powerupDefinitionsConfig = {
  none: {
    behaviors: [],
    toolbarIcon: "NonePowerupIcon",
    slotColor: ex.Color.fromHex("#9c8bdb"),
    durationMs: 0,
    breakDurationMultiplier: 3,
    body: defaultBody,
    actions: {
      blockBreak: actionDefinitionFromJson(
        playerNoPowerupAnimation.actions.blockBreak,
      ),
    },
  },
  miner: {
    behaviors: ["mine"],
    toolbarIcon: "MinerPowerupIcon",
    slotColor: ex.Color.fromHex("#d9a441"),
    durationMs: minerPowerupDurationMs,
    breakDurationMultiplier: 1,
    body: minerBlockBreakAnimation.body,
    hat: {
      poses: hatPosesFromJson(minerBlockBreakAnimation.hat.poses),
    },
    actions: {
      blockBreak: actionDefinitionFromJson(
        minerBlockBreakAnimation.actions.blockBreak,
      ),
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

const animationFor = (track: PowerupAnimationTrack) =>
  new ex.Animation({
    frames: track.frames.map((frame) => ({
      graphic: spriteForFrame(frame),
    })),
    frameDuration: track.frameDurationMs,
    strategy: ex.AnimationStrategy.Loop,
  });

type CreateAttachmentActor = (layer: number) => ex.Actor;

const actionAnimationFor = (
  action: PowerupActionDefinition,
  createAttachmentActor: CreateAttachmentActor,
  mirrorWidth: number,
  onFrame: () => void,
) =>
  new AttachedVisualAnimation({
    frames: action.frames.map((frame) => ({
      graphic: spriteForFrame(frame),
    })),
    frameDurationMs: action.frameDurationMs,
    baseDamage: action.baseDamage,
    hitboxes: action.hitboxes,
    attachments: action.attachments?.map(
      (attachment): AttachedVisualAttachment => ({
        actor: createAttachmentActor(attachment.layer),
        sprite: spriteFor(attachment.sprite),
        poses: attachment.poses,
      }),
    ),
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
  createAttachmentActor: CreateAttachmentActor,
  mirrorWidth: number,
  onActionFrame: () => void,
): PowerupVisuals => {
  const definition = powerupDefinitionFor(powerup);
  const activeUse = definition.actions.activeUse;
  return {
    toolbarIcon: spriteFor(definition.toolbarIcon),
    idleAnimation: animationFor(definition.body.idle),
    jumpAnimation: animationFor(definition.body.jump),
    crouchAnimation: animationFor(definition.body.crouch),
    walkAnimation: animationFor(definition.body.walk),
    walkFrameDurationMs: definition.body.walk.frameDurationMs,
    walkFrameCount: definition.body.walk.frames.length,
    hat: definition.hat
      ? {
          sprite: spriteFor("MinerHat"),
          poses: definition.hat.poses,
        }
      : undefined,
    actions: {
      blockBreak: actionAnimationFor(
        definition.actions.blockBreak,
        createAttachmentActor,
        mirrorWidth,
        onActionFrame,
      ),
      ...(activeUse
        ? {
            activeUse: actionAnimationFor(
              activeUse,
              createAttachmentActor,
              mirrorWidth,
              onActionFrame,
            ),
          }
        : {}),
    },
  };
};
