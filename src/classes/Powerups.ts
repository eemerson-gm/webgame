import * as ex from "excalibur";
import { Resources } from "../resource";
import {
  AttachedVisualAnimation,
  type AttachedVisualPose,
} from "./AttachedVisualAnimation";

const walkFrameDurationMs = 120;
const usePowerupFrameDurationMs = 75;

type ResourceKey = Exclude<keyof typeof Resources, "GameFont">;
export type PowerupBehavior = "mine";

type PowerupDefinition = {
  behaviors: readonly PowerupBehavior[];
  toolbarIcon: ResourceKey;
  slotColor: ex.Color;
  body: {
    idle: ResourceKey;
    jump: ResourceKey;
    crouch: ResourceKey;
    walk: {
      frames: readonly ResourceKey[];
      frameDurationMs: number;
    };
  };
  use: {
    frames: readonly ResourceKey[];
    frameDurationMs: number;
    attachment?: {
      sprite: ResourceKey;
      poses: readonly AttachedVisualPose[];
    };
  };
};

export type PowerupVisuals = {
  toolbarIcon: ex.Sprite;
  idleSprite: ex.Sprite;
  jumpSprite: ex.Sprite;
  crouchSprite: ex.Sprite;
  walkAnimation: ex.Animation;
  usePowerupAnimation: AttachedVisualAnimation;
};

const defaultWalkFrames = ["PlayerWalk1", "PlayerWalk2"] as const;

const defaultUsePowerupFrames = [
  "PlayerUseTool1",
  "PlayerUseTool2",
  "PlayerUseTool3",
  "PlayerUseTool4",
  "PlayerUseTool5",
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
    body: {
      idle: "Player",
      jump: "PlayerJump",
      crouch: "PlayerCrouch",
      walk: {
        frames: defaultWalkFrames,
        frameDurationMs: walkFrameDurationMs,
      },
    },
    use: {
      frames: defaultUsePowerupFrames,
      frameDurationMs: usePowerupFrameDurationMs,
    },
  },
  miner: {
    behaviors: ["mine"],
    toolbarIcon: "BronzePickaxeItem",
    slotColor: ex.Color.fromHex("#b66a2c"),
    body: {
      idle: "Player",
      jump: "PlayerJump",
      crouch: "PlayerCrouch",
      walk: {
        frames: defaultWalkFrames,
        frameDurationMs: walkFrameDurationMs,
      },
    },
    use: {
      frames: defaultUsePowerupFrames,
      frameDurationMs: usePowerupFrameDurationMs,
      attachment: {
        sprite: "BronzePickaxe",
        poses: toolAttachmentPoses,
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

const animationFor = (
  frameKeys: readonly ResourceKey[],
  frameDurationMs: number,
) =>
  new ex.Animation({
    frames: frameKeys.map((spriteKey) => ({
      graphic: spriteFor(spriteKey),
    })),
    frameDuration: frameDurationMs,
    strategy: ex.AnimationStrategy.Loop,
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

export const powerupVisualsFor = (
  powerup: PlayerPowerup,
  attachmentActor: ex.Actor,
  mirrorWidth: number,
): PowerupVisuals => {
  const definition = powerupDefinitionFor(powerup);
  const attachment = definition.use.attachment;
  return {
    toolbarIcon: spriteFor(definition.toolbarIcon),
    idleSprite: spriteFor(definition.body.idle),
    jumpSprite: spriteFor(definition.body.jump),
    crouchSprite: spriteFor(definition.body.crouch),
    walkAnimation: animationFor(
      definition.body.walk.frames,
      definition.body.walk.frameDurationMs,
    ),
    usePowerupAnimation: new AttachedVisualAnimation({
      frames: definition.use.frames.map((spriteKey, index) => ({
        graphic: spriteFor(spriteKey),
        attachment: attachment?.poses[index] ?? attachment?.poses[0],
      })),
      frameDurationMs: definition.use.frameDurationMs,
      attachmentActor,
      attachmentSprite: attachment ? spriteFor(attachment.sprite) : undefined,
      mirrorWidth,
      strategy: ex.AnimationStrategy.Loop,
    }),
  };
};
