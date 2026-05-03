import * as ex from "excalibur";
import { Resources } from "../resource";
import {
  AttachedVisualAnimation,
  type AttachedVisualPose,
} from "./AttachedVisualAnimation";

const walkFrameDurationMs = 120;
const usePowerupFrameDurationMs = 75;
const minerPowerupDurationMs = 30000;

type ResourceKey = Exclude<keyof typeof Resources, "GameFont">;
type PowerupFrame = {
  sprite: ResourceKey;
};
export type PowerupBehavior = "mine";

type PowerupDefinition = {
  behaviors: readonly PowerupBehavior[];
  toolbarIcon: ResourceKey;
  slotColor: ex.Color;
  durationMs: number;
  body: {
    idle: PowerupFrame;
    jump: PowerupFrame;
    crouch: PowerupFrame;
    walk: {
      frames: readonly PowerupFrame[];
      frameDurationMs: number;
    };
  };
  use: {
    frames: readonly PowerupFrame[];
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

const playerFrame = (sprite: ResourceKey): PowerupFrame => ({
  sprite,
});

const defaultWalkFrames = [
  playerFrame("PlayerWalk1"),
  playerFrame("PlayerWalk2"),
] as const;

const defaultUsePowerupFrames = [
  playerFrame("PlayerUseTool1"),
  playerFrame("PlayerUseTool2"),
  playerFrame("PlayerUseTool3"),
  playerFrame("PlayerUseTool4"),
  playerFrame("PlayerUseTool5"),
] as const;

const defaultPunchFrames = [
  playerFrame("PlayerPunch1"),
  playerFrame("PlayerPunch2"),
  playerFrame("PlayerPunch3"),
  playerFrame("PlayerPunch4"),
  playerFrame("PlayerPunch5"),
  playerFrame("PlayerPunch6"),
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
    body: {
      idle: playerFrame("Player"),
      jump: playerFrame("PlayerJump"),
      crouch: playerFrame("PlayerCrouch"),
      walk: {
        frames: defaultWalkFrames,
        frameDurationMs: walkFrameDurationMs,
      },
    },
    use: {
      frames: defaultPunchFrames,
      frameDurationMs: usePowerupFrameDurationMs,
    },
  },
  miner: {
    behaviors: ["mine"],
    toolbarIcon: "MinerPowerupIcon",
    slotColor: ex.Color.fromHex("#d9a441"),
    durationMs: minerPowerupDurationMs,
    body: {
      idle: playerFrame("Player"),
      jump: playerFrame("PlayerJump"),
      crouch: playerFrame("PlayerCrouch"),
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

export const powerupVisualsFor = (
  powerup: PlayerPowerup,
  attachmentActor: ex.Actor,
  mirrorWidth: number,
): PowerupVisuals => {
  const definition = powerupDefinitionFor(powerup);
  const attachment = definition.use.attachment;
  return {
    toolbarIcon: spriteFor(definition.toolbarIcon),
    idleSprite: spriteForFrame(definition.body.idle),
    jumpSprite: spriteForFrame(definition.body.jump),
    crouchSprite: spriteForFrame(definition.body.crouch),
    walkAnimation: animationFor(
      definition.body.walk.frames,
      definition.body.walk.frameDurationMs,
    ),
    usePowerupAnimation: new AttachedVisualAnimation({
      frames: definition.use.frames.map((frame, index) => ({
        graphic: spriteForFrame(frame),
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
