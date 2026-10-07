import { HOLD, PICKUP } from '../config';
import { live, r, t, gray, v3, type Item, type Section } from './tuning';
import { POSE_COUNT } from '../dev/avatar-preview';

// F3 panel contents for playing (tuning.ts has the helpers).

/** Every kind's world pickup (PICKUP.models): one heading each, same sliders for each. */
function pickupItems(): Item[] {
  const label = { can: 'COLOR CAN' } as Record<string, string>;
  return (Object.keys(PICKUP.models) as (keyof typeof PICKUP.models)[]).flatMap((k) => [
    { kind: 'heading', label: label[k] ?? k.toUpperCase() } as Item,
    r('size', ['PICKUP', 'models', k, 'size'], 0.2, 4, 0.05),
    ...v3('offset (m)', ['PICKUP', 'models', k, 'offset'], -0.5, 0.5, 0.01),
    ...v3('rotation (rad)', ['PICKUP', 'models', k, 'rotation'], -3.14, 3.14, 0.01),
  ]);
}

/** First-person pose of every held tool (HOLD): one heading per tool, same sliders for each. */
function holdItems(): Item[] {
  return (Object.keys(HOLD) as (keyof typeof HOLD)[]).flatMap((tool) => [
    { kind: 'heading', label: tool.toUpperCase() } as Item,
    r('distance', ['HOLD', tool, 'distance'], 0.15, 1.2, 0.01),
    r('right', ['HOLD', tool, 'x'], -1, 1, 0.005),
    r('up', ['HOLD', tool, 'y'], -1, 0.5, 0.005),
    r('size', ['HOLD', tool, 'scale'], 0.3, 2.5, 0.05),
    r('tilt', ['HOLD', tool, 'pitch'], -3.14, 3.14, 0.01),
    r('turn', ['HOLD', tool, 'yaw'], -3.14, 3.14, 0.01),
    r('lean', ['HOLD', tool, 'roll'], -3.14, 3.14, 0.01),
  ]);
}


/** F3 sections for playing: movement, pickups, camera, hands, held, avatar, ghost. */
export function playSections(): Section[] {
  const p = () => live.player;
  const net = () => live.ghostNet();
  const v2 = (x: number, y: number) => Math.hypot(x, y).toFixed(2);
  return [
    {
      id: 'movement',
      title: 'Movement',
      items: [
        { kind: 'readout', label: 'position', get: () => (p() ? `${p()!.position.x.toFixed(2)}, ${p()!.position.y.toFixed(2)}, ${p()!.position.z.toFixed(2)}` : '-') },
        { kind: 'readout', label: 'speed', get: () => (p() ? `${v2(p()!.velocity.x, p()!.velocity.z)} m/s` : '-') },
        { kind: 'readout', label: 'vertical', get: () => (p() ? `${p()!.velocity.y.toFixed(2)} m/s` : '-') },
        { kind: 'readout', label: 'state', get: () => p()?.state ?? '-' },
        r('walk speed', ['PLAYER', 'walkSpeed'], 1, 12, 0.1),
        r('sprint speed', ['PLAYER', 'sprintSpeed'], 1, 16, 0.1),
        r('crouch speed', ['PLAYER', 'crouchSpeed'], 0.5, 6, 0.1),
        r('acceleration', ['PLAYER', 'acceleration'], 1, 40, 0.5),
        r('ground friction', ['PLAYER', 'friction'], 1, 40, 0.5),
        r('air control', ['PLAYER', 'airControl'], 0, 1, 0.01),
        r('jump height', ['PLAYER', 'jumpHeight'], 0.2, 3, 0.01),
        r('gravity', ['PLAYER', 'gravity'], 4, 40, 0.5),
        r('ladder climb speed', ['PLAYER', 'climbSpeed'], 0.5, 6, 0.1),
        r('step height', ['PLAYER', 'stepHeight'], 0, 0.8, 0.01),
        r('crouch collider', ['PLAYER', 'crouchHeight'], 0.6, 1.7, 0.01),
        r('ladder jump-off push', ['PLAYER', 'ladderJumpOff'], 0, 10, 0.1),
      ],
    },
    {
      id: 'pickups',
      title: 'Pickups',
      items: [
        r('pickup radius', ['PICKUP', 'radius'], 0.2, 3, 0.05),
        r('hover height', ['PICKUP', 'hover'], 0, 2, 0.05),
        r('spin speed', ['PICKUP', 'spin'], 0, 6, 0.1),
        r('bob', ['PICKUP', 'bob'], 0, 0.5, 0.01),
        ...pickupItems(),
      ],
    },
    {
      id: 'avatar',
      title: 'Avatar',
      items: [
        { kind: 'readout', label: 'test figure', get: () => live.avatarPose() },
        { kind: 'action', label: 'SHOW / HIDE TEST FIGURE', run: () => live.avatarToggle() },
        { kind: 'action', label: 'PREVIOUS POSE', run: () => live.avatarPrevious() },
        { kind: 'action', label: 'NEXT POSE', run: () => live.avatarNext() },
        { kind: 'action', label: 'CYCLE POSES', run: () => live.avatarCycle() },
        r('pose', ['AVATAR_TEST', 'pose'], 0, POSE_COUNT - 1, 1, () => live.avatarPick()),
        r('slow motion', ['AVATAR_TEST', 'timeScale'], 0.05, 1, 0.05),
        r('look up / down', ['AVATAR_TEST', 'pitch'], -1.5, 1.5, 0.01),
        r('walk speed', ['AVATAR_TEST', 'speed'], 0, 8, 0.1),
        t('walk on the spot', ['AVATAR_TEST', 'onTheSpot']),
        r('loop radius', ['AVATAR_TEST', 'loop'], 0.8, 4, 0.1),
        t('hood up', ['AVATAR', 'hoodUp'], () => live.avatarRestyle()),
        { kind: 'heading', label: 'MOTION' },
        r('step length', ['AVATAR', 'step'], 0.3, 1.2, 0.01),
        r('step length when running', ['AVATAR', 'stepPerSpeed'], 0, 0.3, 0.005),
        r('foot lift', ['AVATAR', 'stepLift'], 0, 0.4, 0.005),
        r('crouch: hips drop', ['AVATAR', 'crouchDrop'], 0, 0.6, 0.01),
        r('crouch: lean', ['AVATAR', 'crouchLean'], -0.6, 1, 0.01),
        r('crouch: spraying lean', ['AVATAR', 'crouchSprayLean'], -0.6, 0.6, 0.01),
        r('sprint: lean', ['AVATAR', 'sprintLean'], 0, 0.6, 0.01),
        r('pose blend speed', ['AVATAR', 'blend'], 1, 30, 0.5),
        { kind: 'heading', label: 'GRAY TONES' },
        gray('hoodie', ['AVATAR', 'colors', 'hoodie'], () => live.avatarRestyle()),
        gray('trim', ['AVATAR', 'colors', 'trim'], () => live.avatarRestyle()),
        gray('pocket', ['AVATAR', 'colors', 'pocket'], () => live.avatarRestyle()),
        gray('pants', ['AVATAR', 'colors', 'pants'], () => live.avatarRestyle()),
        gray('shoe', ['AVATAR', 'colors', 'shoe'], () => live.avatarRestyle()),
        gray('sole', ['AVATAR', 'colors', 'sole'], () => live.avatarRestyle()),
        gray('head', ['AVATAR', 'colors', 'head'], () => live.avatarRestyle()),
        gray('eyes', ['AVATAR', 'colors', 'eyes'], () => live.avatarRestyle()),
        gray('glove', ['AVATAR', 'colors', 'glove'], () => live.avatarRestyle()),
      ],
    },
    {
      id: 'ghost',
      title: 'Ghost',
      items: [
        { kind: 'readout', label: 'ghost', get: () => live.ghostState() },
        { kind: 'readout', label: 'shown behind them', get: () => (net() ? `${(net()!.delay * 1000).toFixed(0)} ms` : '-') },
        { kind: 'readout', label: 'jitter measured', get: () => (net() ? `${(net()!.jitter * 1000).toFixed(0)} ms` : '-') },
        { kind: 'readout', label: 'snapshots buffered', get: () => (net() ? `${net()!.buffered}` : '-') },
        { kind: 'readout', label: 'guessing (no new snapshot)', get: () => (net() ? (net()!.guessing ? 'YES' : 'no') : '-') },
        { kind: 'readout', label: 'correction gliding', get: () => (net() ? `${(net()!.correction * 100).toFixed(0)} cm` : '-') },
        { kind: 'action', label: 'RECORD', run: () => live.ghostRecord() },
        { kind: 'action', label: 'PLAY (LOOP)', run: () => live.ghostPlay() },
        { kind: 'action', label: 'FOLLOW ME', run: () => live.ghostFollow() },
        { kind: 'action', label: 'STOP', run: () => live.ghostStop() },
        r('network delay (s)', ['GHOST', 'latency'], 0, 0.5, 0.01),
        r('jitter (s)', ['GHOST', 'jitter'], 0, 0.3, 0.01),
        r('hiccups (share of packets)', ['GHOST', 'hiccups'], 0, 0.2, 0.005),
        r('follow delay (s)', ['GHOST', 'followDelay'], 0.5, 5, 0.1),
        r('shown behind the newest snapshot (s)', ['NET', 'interpDelay'], 0, 0.5, 0.01),
        r('keep going without snapshots for (s)', ['NET', 'extrapolate'], 0, 1, 0.05),
      ],
    },
    {
      id: 'camera',
      title: 'Camera',
      items: [
        r('camera height', ['PLAYER', 'eyeHeight'], 0.8, 1.75, 0.01),
        r('crouch camera height', ['PLAYER', 'crouchEyeHeight'], 0.5, 1.5, 0.01),
        r('crouch transition', ['PLAYER', 'crouchTransition'], 2, 40, 0.5),
        r('step smoothing', ['PLAYER', 'stepSmoothing'], 2, 60, 0.5),
        r('mouse sensitivity', ['PLAYER', 'mouseSensitivity'], 0.0005, 0.006, 0.0001),
        r('FOV', ['RENDER', 'fov'], 50, 110, 1),
        r('sprint FOV boost', ['RENDER', 'sprintFovBoost'], 0, 20, 0.5),
        r('sprint FOV ease', ['RENDER', 'sprintFovEase'], 1, 30, 0.5),
      ],
    },
    {
      id: 'hands',
      title: 'Hands',
      items: [
        r('look sway', ['VIEWMODEL', 'swayAmount'], 0, 0.004, 0.0001),
        r('max sway', ['VIEWMODEL', 'swayMax'], 0, 0.3, 0.01),
        r('sway return', ['VIEWMODEL', 'swayReturn'], 1, 30, 0.5),
        r('walk bob', ['VIEWMODEL', 'bobAmount'], 0, 0.03, 0.001),
        r('bob frequency', ['VIEWMODEL', 'bobFrequency'], 0.1, 1.5, 0.05),
        r('jump lag', ['VIEWMODEL', 'fallLag'], 0, 0.01, 0.0005),
        r('jump lag max', ['VIEWMODEL', 'fallLagMax'], 0, 0.15, 0.005),
        r('trigger press', ['VIEWMODEL', 'pressCurl'], 0, 0.3, 0.01),
        r('trigger speed', ['VIEWMODEL', 'pressSpeed'], 2, 60, 1),
        // To be reworked: shown, not editable.
        { kind: 'heading', label: 'LEFT HAND ON WALLS', disabled: true },
        r('reach (m)', ['WALL_HAND', 'reach'], 0.3, 1.5, 0.05),
        r('let go at (m)', ['WALL_HAND', 'release'], 0.4, 2, 0.05),
        r('speed', ['WALL_HAND', 'speed'], 1, 20, 0.5),
        r('slide after (m)', ['WALL_HAND', 'slide'], 0.05, 1, 0.05),
        r('look for walls from (° left)', ['WALL_HAND', 'fromAngle'], 0, 90, 1),
        r('look for walls to (° left)', ['WALL_HAND', 'toAngle'], 30, 180, 1),
        r('hand below eyes (m)', ['WALL_HAND', 'drop'], 0, 1, 0.01),
        r('finger lean on wall (rad)', ['WALL_HAND', 'fingerLean'], -1, 1, 0.01),
        r('gap to wall (m)', ['WALL_HAND', 'gap'], 0, 0.05, 0.001),
        ...v3('comes in from (position)', ['WALL_HAND', 'restOffset'], -0.8, 0.8, 0.005),
        ...v3('comes in from (rotation)', ['WALL_HAND', 'restRotation'], -3.14, 3.14, 0.01),
        r('wrist bend coming in (rad)', ['WALL_HAND', 'restWristBend'], -1.5, 1.5, 0.01),
        r('wrist bend on wall (rad)', ['WALL_HAND', 'wallWristBend'], -1.5, 1.5, 0.01),
      ],
    },
    {
      id: 'held',
      title: 'Held',
      items: holdItems(),
    },
  ];
}
