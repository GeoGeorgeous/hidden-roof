import { HOLD } from '../config';
import { live, r, t, gray, v3, type Item, type Section } from './tuning';
import { POSE_COUNT } from '../dev/avatar-preview';

// F3 panel contents for playing (tuning.ts has the helpers).

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
    // The sponge's hand scrubs in small circles while cleaning (only how it looks).
    ...(tool === 'sponge' ? [r('scrub size', ['SPONGE', 'scrubSize'], 0, 0.05, 0.001), r('scrub speed', ['SPONGE', 'scrubSpeed'], 0, 12, 0.1)] : []),
  ]);
}


/** F3 sections for playing: movement, camera, hands, held, avatar, ghost. */
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
        r('sprint: speed', ['PLAYER', 'sprintSpeed'], 1, 16, 0.1),
        r('sprint: double tap', ['PLAYER', 'sprintDoubleTap'], 0.1, 0.6, 0.01),
        r('crouch: speed', ['PLAYER', 'crouchSpeed'], 0.5, 6, 0.1),
        r('acceleration', ['PLAYER', 'acceleration'], 1, 40, 0.5),
        r('friction', ['PLAYER', 'friction'], 1, 40, 0.5),
        r('air control', ['PLAYER', 'airControl'], 0, 1, 0.01),
        r('jump height', ['PLAYER', 'jumpHeight'], 0.2, 3, 0.01),
        r('gravity', ['PLAYER', 'gravity'], 4, 40, 0.5),
        r('ladder: climb speed', ['PLAYER', 'climbSpeed'], 0.5, 6, 0.1),
        r('step height', ['PLAYER', 'stepHeight'], 0, 0.8, 0.01),
        r('crouch: height', ['PLAYER', 'crouchHeight'], 0.6, 1.7, 0.01),
      ],
    },
    {
      id: 'stepladder',
      title: 'Stepladder',
      items: [
        r('reach', ['STEPLADDER_PLACE', 'reach'], 1, 10, 0.1),
        r('feet: tolerance', ['STEPLADDER_PLACE', 'footTolerance'], 0, 0.2, 0.005),
        r('stand: step', ['STEPLADDER_PLACE', 'standStep'], 0, 1, 0.05),
      ],
    },
    {
      id: 'avatar',
      title: 'Avatar',
      items: [
        t('hood up', ['AVATAR', 'hoodUp'], () => live.avatarRestyle()),
        { kind: 'heading', label: 'MOTION' },
        r('step length', ['AVATAR', 'step'], 0.3, 1.2, 0.01),
        r('run: step length', ['AVATAR', 'stepPerSpeed'], 0, 0.3, 0.005),
        r('foot lift', ['AVATAR', 'stepLift'], 0, 0.4, 0.005),
        r('crouch: hips drop', ['AVATAR', 'crouchDrop'], 0, 0.6, 0.01),
        r('crouch: lean', ['AVATAR', 'crouchLean'], -0.6, 1, 0.01),
        r('crouch: spraying lean', ['AVATAR', 'crouchSprayLean'], -0.6, 0.6, 0.01),
        r('sprint: lean', ['AVATAR', 'sprintLean'], 0, 0.6, 0.01),
        r('blend speed', ['AVATAR', 'blend'], 1, 30, 0.5),
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
      id: 'avatar-test',
      title: 'Avatar test',
      items: [
        { kind: 'readout', label: 'showing', get: () => live.avatarPose() },
        { kind: 'action', label: 'SHOW / HIDE', run: () => live.avatarToggle() },
        { kind: 'action', label: 'PREVIOUS POSE', run: () => live.avatarPrevious() },
        { kind: 'action', label: 'NEXT POSE', run: () => live.avatarNext() },
        { kind: 'action', label: 'CYCLE POSES', run: () => live.avatarCycle() },
        r('pose', ['AVATAR_TEST', 'pose'], 0, POSE_COUNT - 1, 1, () => live.avatarPick()),
        r('slow motion', ['AVATAR_TEST', 'timeScale'], 0.05, 1, 0.05),
        r('look up / down', ['AVATAR_TEST', 'pitch'], -1.5, 1.5, 0.01),
        r('walk speed', ['AVATAR_TEST', 'speed'], 0, 8, 0.1),
        t('on the spot', ['AVATAR_TEST', 'onTheSpot']),
        r('loop size', ['AVATAR_TEST', 'loopSize'], 1.6, 8, 0.1),
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
        { kind: 'readout', label: 'guessing', get: () => (net() ? (net()!.guessing ? 'YES' : 'no') : '-') },
        { kind: 'readout', label: 'correction gliding', get: () => (net() ? `${(net()!.correction * 100).toFixed(0)} cm` : '-') },
        { kind: 'action', label: 'RECORD', run: () => live.ghostRecord() },
        { kind: 'action', label: 'PLAY (LOOP)', run: () => live.ghostPlay() },
        { kind: 'action', label: 'FOLLOW ME', run: () => live.ghostFollow() },
        { kind: 'action', label: 'STOP', run: () => live.ghostStop() },
        r('net: delay', ['GHOST', 'latency'], 0, 0.5, 0.01),
        r('net: jitter', ['GHOST', 'jitter'], 0, 0.3, 0.01),
        r('net: hiccups', ['GHOST', 'hiccups'], 0, 0.2, 0.005),
        r('follow: delay', ['GHOST', 'followDelay'], 0.5, 5, 0.1),
        r('shown behind: min', ['NET', 'interpDelay'], 0, 0.5, 0.01),
        r('keep going for', ['NET', 'extrapolate'], 0, 1, 0.05),
      ],
    },
    {
      id: 'camera',
      title: 'Camera',
      items: [
        r('height', ['PLAYER', 'eyeHeight'], 0.8, 1.75, 0.01),
        r('crouch: height', ['PLAYER', 'crouchEyeHeight'], 0.5, 1.5, 0.01),
        r('crouch: speed', ['PLAYER', 'crouchTransition'], 2, 40, 0.5),
        r('step smoothing', ['PLAYER', 'stepSmoothing'], 2, 60, 0.5),
        r('mouse sensitivity', ['PLAYER', 'mouseSensitivity'], 0.0005, 0.006, 0.0001),
        r('fov', ['RENDER', 'fov'], 50, 110, 1),
        r('sprint: fov boost', ['RENDER', 'sprintFovBoost'], 0, 20, 0.5),
        r('sprint: fov speed', ['RENDER', 'sprintFovEase'], 1, 30, 0.5),
      ],
    },
    {
      id: 'hands',
      title: 'Hands',
      items: [
        r('sway', ['VIEWMODEL', 'swayAmount'], 0, 0.004, 0.0001),
        r('sway: max', ['VIEWMODEL', 'swayMax'], 0, 0.3, 0.01),
        r('sway: return', ['VIEWMODEL', 'swayReturn'], 1, 30, 0.5),
        r('bob', ['VIEWMODEL', 'bobAmount'], 0, 0.03, 0.001),
        r('bob: frequency', ['VIEWMODEL', 'bobFrequency'], 0.1, 1.5, 0.05),
        r('jump lag', ['VIEWMODEL', 'fallLag'], 0, 0.01, 0.0005),
        r('jump lag: max', ['VIEWMODEL', 'fallLagMax'], 0, 0.15, 0.005),
        r('trigger: press', ['VIEWMODEL', 'pressCurl'], 0, 0.3, 0.01),
        r('trigger: speed', ['VIEWMODEL', 'pressSpeed'], 2, 60, 1),
        // To be reworked: shown, not editable.
        { kind: 'heading', label: 'LEFT HAND ON WALLS', disabled: true },
        r('reach', ['WALL_HAND', 'reach'], 0.3, 1.5, 0.05),
        r('let go at', ['WALL_HAND', 'release'], 0.4, 2, 0.05),
        r('speed', ['WALL_HAND', 'speed'], 1, 20, 0.5),
        r('slide after', ['WALL_HAND', 'slide'], 0.05, 1, 0.05),
        r('search: from', ['WALL_HAND', 'fromAngle'], 0, 90, 1),
        r('search: to', ['WALL_HAND', 'toAngle'], 30, 180, 1),
        r('drop', ['WALL_HAND', 'drop'], 0, 1, 0.01),
        r('finger lean', ['WALL_HAND', 'fingerLean'], -1, 1, 0.01),
        r('gap', ['WALL_HAND', 'gap'], 0, 0.05, 0.001),
        ...v3('rest: position', ['WALL_HAND', 'restOffset'], -0.8, 0.8, 0.005),
        ...v3('rest: rotation', ['WALL_HAND', 'restRotation'], -3.14, 3.14, 0.01),
        r('wrist: coming in', ['WALL_HAND', 'restWristBend'], -1.5, 1.5, 0.01),
        r('wrist: on wall', ['WALL_HAND', 'wallWristBend'], -1.5, 1.5, 0.01),
      ],
    },
    {
      id: 'held',
      title: 'Held',
      items: holdItems(),
    },
  ];
}
