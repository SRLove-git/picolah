/** Times are seconds; angles are radians; distances use the original 768×804 art. */
export type CapyAction = 'idle' | 'pet' | 'feed' | 'play' | 'rest' | 'wake' | 'outfit';
export interface CapyMotion { action: CapyAction; sequence: number; playing: boolean }
export interface CapyPose {
  head: number; lift: number; stretch: number; lean: number;
  ears: number; chew: number; bag: number; breath: number; blink: number;
}
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const smooth = (n: number) => { const t = clamp(n); return t * t * (3 - 2 * t); };
const envelope = (time: number, end: number) => smooth(time / 0.18) * (1 - smooth((time - end + 0.5) / 0.5));
const blinkAt = (time: number, start: number) => time > start && time < start + 0.2 ? Math.sin((time - start) / 0.2 * Math.PI) : 0;

/** Authored clips share an idle pose, so every action can settle naturally. */
export function capyPose(action: CapyAction, time: number, clock: number): CapyPose {
  const breathing = Math.sin(clock * Math.PI * 2 / (action === 'rest' ? 4.8 : 4.2));
  const pose: CapyPose = {
    head: Math.sin(clock * 1.05) * 0.012, lift: 0, stretch: 0, lean: 0,
    ears: Math.sin(clock * 1.7) * 0.025,
    chew: 0, bag: Math.sin(clock * 1.05 - 0.5) * 0.6,
    breath: breathing * 0.006,
    blink: blinkAt(clock % 5.8, 3.1) + blinkAt(clock % 11.6, 9.2),
  };
  const active = envelope(time, 3.9);
  if (action === 'pet') {
    pose.head += Math.sin(time * 4.4) * 0.085 * active;
    pose.lean = -0.018 * active;
    pose.ears += Math.sin(time * 11) * 0.14 * active;
    pose.stretch = -0.016 * active;
  } else if (action === 'feed') {
    pose.head += (0.025 + Math.sin(time * 6) * 0.018) * active;
    pose.chew = Math.sin(time * 17) * 8 * active;
    pose.bag += Math.sin(time * 8) * 3 * active;
    pose.ears += Math.sin(time * 6 + 1) * 0.06 * active;
  } else if (action === 'play' || action === 'outfit') {
    // Anticipate, hop, land, then a smaller second hop and a settling bag swing.
    const hop = (start: number, duration: number, height: number) => {
      const p = (time - start) / duration;
      return p > 0 && p < 1 ? Math.sin(p * Math.PI) * height : 0;
    };
    const first = hop(0.25, 0.7, action === 'outfit' ? 25 : 50);
    const second = hop(1.12, 0.6, action === 'outfit' ? 15 : 32);
    pose.lift = -(first + second);
    pose.stretch = (-0.035 * Math.exp(-Math.pow((time - 0.18) / 0.13, 2))
      + (first + second) * 0.00065 - 0.03 * Math.exp(-Math.pow((time - 1.01) / 0.13, 2))) * active;
    pose.lean = Math.sin(time * 5) * 0.035 * active;
    pose.head += Math.sin(time * 4.2 + 0.4) * 0.05 * active;
    pose.ears += Math.sin(time * 12) * 0.17 * active;
    pose.bag += Math.sin(time * 7 - 0.7) * 8 * active;
  } else if (action === 'rest') {
    const settle = smooth(time / 0.5);
    pose.head = (0.065 + breathing * 0.012) * settle;
    pose.lean = -0.012 * settle;
    pose.breath = breathing * 0.012;
    pose.ears = 0;
    pose.bag = breathing * 0.5;
    pose.blink = 0;
  } else if (action === 'wake') {
    const stretch = Math.sin(Math.min(time / 1.5, 1) * Math.PI) * active;
    pose.stretch = stretch * 0.035;
    pose.head -= stretch * 0.055;
    pose.ears += Math.sin(time * 9) * 0.1 * active;
  }
  return pose;
}

/** Retarget from the currently rendered pose, including during repeated taps. */
export function blendCapyPose(from: CapyPose, to: CapyPose, progress: number): CapyPose {
  const amount = smooth(progress);
  return Object.fromEntries(Object.keys(to).map((key) => {
    const property = key as keyof CapyPose;
    return [property, from[property] + (to[property] - from[property]) * amount];
  })) as unknown as CapyPose;
}
