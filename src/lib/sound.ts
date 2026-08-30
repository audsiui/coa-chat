"use client";

/**
 * Web Audio 合成的通知提示音（无音频资源）。
 * AudioContext 需用户手势解锁：首次播放前若处于 suspended 则尝试 resume。
 * 3 秒节流，避免消息轰炸时噪音刷屏。
 */
let audioCtx: AudioContext | null = null;
let lastPlay = 0;

export function playNotifySound(): void {
  const now = Date.now();
  if (now - lastPlay < 3000) return;
  lastPlay = now;

  try {
    if (!audioCtx) {
      const w = window as unknown as {
        AudioContext?: typeof AudioContext;
        webkitAudioContext?: typeof AudioContext;
      };
      const Ctor = w.AudioContext ?? w.webkitAudioContext;
      if (!Ctor) return;
      audioCtx = new Ctor();
    }
    if (audioCtx.state === "suspended") void audioCtx.resume();

    const ctx = audioCtx;
    const t0 = ctx.currentTime + 0.02;
    const notes: Array<[number, number]> = [
      [880, 0],
      [1318.5, 0.11],
    ];
    for (const [freq, offset] of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = t0 + offset;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.12, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.25);
    }
  } catch {
    /* 自动播放策略限制时静默忽略 */
  }
}
