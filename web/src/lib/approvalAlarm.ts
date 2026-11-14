// Approver phone alarm (checklist step 8): a loud two-tone sound made with Web Audio (no audio
// file to load or block) and a screen wake lock. OWNER: Jordan (P4).
//
// Browsers, iPhones especially, only allow sound after the user taps something, so
// `arm()` must be called from a tap handler. iPhones also can't vibrate from a web page,
// which is why the alert is sound plus a full-screen red view.

export type Alarm = {
  /** Call from a tap. Unlocks audio; returns false if this browser has no Web Audio. */
  arm: () => boolean;
  /** True once audio is unlocked and running. */
  armed: () => boolean;
  /** Start the repeating two-tone sound (no-op if not armed or already ringing). */
  ring: () => void;
  stop: () => void;
};

export function createAlarm(): Alarm {
  let ctx: AudioContext | null = null;
  let timer: number | undefined;

  const tone = (freq: number, start: number, length: number) => {
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = freq;
    // Short attack and release so it's loud without clicking.
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.35, start + 0.02);
    gain.gain.setValueAtTime(0.35, start + length - 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + length + 0.01);
  };

  const burst = () => {
    if (!ctx) return;
    const t = ctx.currentTime + 0.02;
    tone(880, t, 0.22);
    tone(660, t + 0.26, 0.22);
    tone(880, t + 0.52, 0.22);
  };

  return {
    arm() {
      const AudioCtor = typeof window !== "undefined" ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) : undefined;
      if (!AudioCtor) return false;
      ctx ??= new AudioCtor();
      if (ctx.state === "suspended") void ctx.resume();
      // A silent blip inside the tap is what actually unlocks audio on iOS.
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0;
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.05);
      return true;
    },
    armed: () => ctx !== null && ctx.state === "running",
    ring() {
      if (!ctx || timer !== undefined) return;
      burst();
      timer = window.setInterval(burst, 1600);
    },
    stop() {
      if (timer !== undefined) window.clearInterval(timer);
      timer = undefined;
    },
  };
}

type WakeLockSentinelLike = { release: () => Promise<void>; addEventListener: (type: "release", cb: () => void) => void };
type WakeLockNavigator = Navigator & { wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinelLike> } };

export type WakeState = "on" | "unsupported" | "failed" | "released";

/** Ask the browser to keep the screen on. Call from a tap, and again when the page is shown. */
export async function keepScreenOn(onRelease: () => void): Promise<WakeState> {
  const nav = navigator as WakeLockNavigator;
  if (!nav.wakeLock) return "unsupported";
  try {
    const lock = await nav.wakeLock.request("screen");
    lock.addEventListener("release", onRelease);
    return "on";
  } catch {
    return "failed";
  }
}
