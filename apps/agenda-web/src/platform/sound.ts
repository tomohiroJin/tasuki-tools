/**
 * 時間切れの音（#429 spec §4.7 判断 J14・#669）。
 *
 * **timer-web の写し（`apps/timer-web/src/platform/sound.ts` の `installAudioUnlock`・`scheduleTones`・`CHIMES` の
 * id と label）。共通化しない**（#669 D7・原則 X: agenda は 2 つ目の利用者）。timer は音量の設定・振動・
 * カウントダウンの読み上げ・`new Audio().play()` を持つが、ここでは持たない（音量は 0.6 固定・D6）。
 * 3 つ目の利用者が来たら共通化を検討する。音ファイルは `public/sounds/` に写してある（音声の名前は `timeout-*`）。
 *
 * 単一の AudioContext を遅延生成して再利用し、利用者の操作で resume（解錠）する。解錠には操作が要るので、
 * 操作しない画面（映しているだけ・途中で入っただけ）は鳴らない。だから「音あり」を押すことが解錠を兼ねる。
 *
 * ファイルの音も共有の AudioContext で鳴らす（D8: `fetch` → `decodeAudioData` → `AudioBufferSourceNode`）。
 * 解錠の規則を 1 つに保ち（解錠前の時間切れは捨てる）、iOS が拒む操作の外の `Audio.play()` を避けるため。
 * 先に読んでおき、鳴らす瞬間にまだ読めていない・読めなかったときは時打ちで代える。
 */

type AudioCtor = typeof AudioContext;

/** 音量（timer の既定と同じ。設定は足さず、端末の音量に任せる・D6） */
const CHIME_VOLUME = 0.6;
/** 懐中時計の時打ち: 高い音から 5 度下へ 2 打（E6 → A5）。余韻を長めに取る */
const STRIKE_FREQS = [1318.5, 880];
const STRIKE_GAP_SEC = 0.42;
const STRIKE_GAIN = 0.45;

function getAudioCtor(): AudioCtor | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
}

/** 解錠の状態の購読者（画面の「音を有効に」／「音あり」の出し分け。最終レビュー I-2） */
const stateListeners = new Set<() => void>();
const notifyState = (): void => stateListeners.forEach((l) => l());

/** 単一 AudioContext（遅延生成・再利用） */
let sharedCtx: AudioContext | null = null;
function getSharedAudioContext(): AudioContext | null {
  const Ctor = getAudioCtor();
  if (!Ctor) return null;
  if (!sharedCtx) {
    try {
      sharedCtx = new Ctor();
    } catch {
      return null;
    }
    // ブラウザが止めた・再び動かしたときも画面へ知らせる
    if (typeof sharedCtx.addEventListener === 'function') sharedCtx.addEventListener('statechange', notifyState);
  }
  return sharedCtx;
}

/**
 * 解錠済み（AudioContext が `running`）か。開き直した直後は操作が無いので false。
 * **ここでは AudioContext を作らない**（操作の前に作ると、ブラウザが「操作の後に作れ」と警告する）。
 */
export function isAudioUnlocked(): boolean {
  return sharedCtx?.state === 'running';
}

/** 解錠の状態の変化を購読する（`useSyncExternalStore` の subscribe）。resume の完了と `statechange` で知らせる */
export function subscribeAudioState(listener: () => void): () => void {
  stateListeners.add(listener);
  return () => {
    stateListeners.delete(listener);
  };
}

/** いま（利用者の操作の中で）解錠する。「音あり」「音を有効に」を押したときに呼ぶ */
export function unlockAudio(): void {
  const ctx = getSharedAudioContext();
  if (ctx === null) return;
  decodePendingChimes();
  // 操作の中で作った AudioContext は最初から running のことがある（statechange が来ない）ので、その場で知らせる
  if (ctx.state === 'suspended') void ctx.resume().then(notifyState, () => {});
  else notifyState();
}

/** 初回の利用者の操作で解錠する（音の切り替えの上の押下を除く）。冪等。進める画面を開いたときに呼ぶ */
let unlockInstalled = false;
export function installAudioUnlock(): void {
  if (unlockInstalled || typeof window === 'undefined') return;
  unlockInstalled = true;
  const unlock = (e: Event): void => {
    // 音の切り替えの上の押下は、切り替え自身の click に任せる（ここで解錠すると、click の時点で「音あり」に
    // なっていて押下が「音なし」へ倒す。pointerdown / keydown は click より先に起きる）
    if (e.target instanceof Element && e.target.closest('[data-sound-toggle]') !== null) return;
    unlockAudio();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
    window.removeEventListener('touchstart', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
  window.addEventListener('touchstart', unlock);
}

/** 指定 AudioContext に音列を予約する。suspended なら resume を待ってから行う */
export async function scheduleTones(
  ctx: AudioContext,
  freqs: number[],
  volume: number,
  opts: { type?: OscillatorType; gap?: number; gain?: number } = {},
): Promise<void> {
  const { type = 'sine', gap = 0.14, gain = 0.5 } = opts;
  const peak = Math.max(0.0001, gain * volume);
  try {
    // 自動で suspend された場合、resume 完了を待ってから予約しないと無音になる（timer #1）
    if (ctx.state === 'suspended') await ctx.resume();
    const now = ctx.currentTime;
    freqs.forEach((freq, i) => {
      const start = now + i * gap;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      osc.connect(g);
      g.connect(ctx.destination);
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(peak, start + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, start + gap - 0.01);
      osc.start(start);
      osc.stop(start + gap);
    });
  } catch {
    /* 自動再生の制限・未対応・resume の失敗は無視する */
  }
}

/** 選べる音の id（timer の `CHIMES` の id と同じ。並びは #669 D1） */
export type ChimeId =
  | 'strike'
  | 'department'
  | 'melody'
  | 'sustained'
  | 'bell'
  | 'chime-up'
  | 'chime-down'
  | 'voice-male'
  | 'voice-female'
  | 'voice-nise'
  | 'voice-mai';

/** 選べる音の一覧（時打ちが先頭・既定。label は timer の写し） */
export const CHIMES: readonly { readonly id: ChimeId; readonly label: string }[] = [
  { id: 'strike', label: '時打ち' },
  { id: 'department', label: '呼び出しチャイム' },
  { id: 'melody', label: 'メロディ' },
  { id: 'sustained', label: '持続トーン' },
  { id: 'bell', label: 'ベル' },
  { id: 'chime-up', label: '上昇 2 音' },
  { id: 'chime-down', label: '下降 2 音' },
  { id: 'voice-male', label: '音声（男声）' },
  { id: 'voice-female', label: '音声（女声）' },
  { id: 'voice-nise', label: '音声（にせ）' },
  { id: 'voice-mai', label: '音声（まい）' },
];

export const DEFAULT_CHIME_ID: ChimeId = 'strike';

export function isChimeId(v: unknown): v is ChimeId {
  return CHIMES.some((c) => c.id === v);
}

/** 音ファイルの名前（`public/sounds/<名前>.mp3`）。ファイルを持たない音（時打ち・トーン）は載せない */
const FILE_NAMES: Partial<Record<ChimeId, string>> = {
  department: 'department',
  melody: 'melody',
  sustained: 'sustained',
  bell: 'bell',
  'voice-male': 'timeout-male',
  'voice-female': 'timeout-female',
  'voice-nise': 'timeout-nise',
  'voice-mai': 'timeout-mai',
};

/** 読み込んだファイルの中身（1 つの id につき fetch は 1 度。失敗は null で覚えて時打ちへ代える） */
const bytesLoads = new Map<ChimeId, Promise<ArrayBuffer | null>>();
/** デコードの結果（AudioContext があるときだけ始める。失敗は null で覚える） */
const decodeLoads = new Map<ChimeId, Promise<AudioBuffer | null>>();
/** デコード済みの音 */
const buffers = new Map<ChimeId, AudioBuffer>();

function fetchBytes(id: ChimeId): Promise<ArrayBuffer | null> {
  const name = FILE_NAMES[id];
  if (name === undefined) return Promise.resolve(null);
  let load = bytesLoads.get(id);
  if (load === undefined) {
    load = (async () => {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}sounds/${name}.mp3`);
        return res.ok ? await res.arrayBuffer() : null;
      } catch {
        return null;
      }
    })();
    bytesLoads.set(id, load);
  }
  return load;
}

/**
 * デコードは**作ってある AudioContext でだけ**行う（操作の前に作ると、ブラウザが「操作の後に作れ」と警告する）。
 * まだ無いときは何もせず（覚えない）、解錠の後に `decodePendingChimes` が改めて呼ぶ。
 */
function decodeChime(id: ChimeId): Promise<AudioBuffer | null> {
  const known = decodeLoads.get(id);
  if (known !== undefined) return known;
  const ctx = sharedCtx;
  if (ctx === null) return Promise.resolve(null);
  const load = fetchBytes(id).then(async (bytes) => {
    if (bytes === null) return null;
    try {
      // decodeAudioData は渡した ArrayBuffer を使い切るので、写しを渡す
      const buffer = await ctx.decodeAudioData(bytes.slice(0));
      buffers.set(id, buffer);
      return buffer;
    } catch {
      return null;
    }
  });
  decodeLoads.set(id, load);
  return load;
}

/** 解錠で AudioContext ができたあと、操作の前に読み終えていた音をデコードする */
function decodePendingChimes(): void {
  for (const id of bytesLoads.keys()) void decodeChime(id);
}

/**
 * ファイルの音を先に読む（選んだとき・進める画面を開いたとき）。同じ id は 1 度だけ。
 * AudioContext が使えない環境では何もしない。**ここでは AudioContext を作らない**（読むだけ。デコードは解錠の後）。
 */
export function preloadChime(id: ChimeId): void {
  if (FILE_NAMES[id] === undefined || getAudioCtor() === undefined) return;
  void fetchBytes(id).then(() => decodeChime(id));
}

/** 選んだ音を鳴らす。ファイルの音がデコード済みでなければ時打ちで代える（D8） */
function playNow(ctx: AudioContext, id: ChimeId): void {
  if (id === 'chime-up' || id === 'chime-down') {
    const freqs = id === 'chime-up' ? [660, 990] : [990, 660];
    void scheduleTones(ctx, freqs, CHIME_VOLUME);
    return;
  }
  const buffer = buffers.get(id);
  if (buffer !== undefined) {
    void playBuffer(ctx, buffer);
    return;
  }
  void scheduleTones(ctx, STRIKE_FREQS, CHIME_VOLUME, { type: 'triangle', gap: STRIKE_GAP_SEC, gain: STRIKE_GAIN });
}

async function playBuffer(ctx: AudioContext, buffer: AudioBuffer): Promise<void> {
  try {
    if (ctx.state === 'suspended') await ctx.resume();
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    source.buffer = buffer;
    gain.gain.value = CHIME_VOLUME;
    source.connect(gain);
    gain.connect(ctx.destination);
    source.start();
  } catch {
    /* 自動再生の制限・未対応・resume の失敗は無視する */
  }
}

/**
 * 時間切れの音を 1 回鳴らす（fire-and-forget）。
 * **解錠されていない（`running` でない）ときは捨てる。** 予約は resume を待ってから行うので、
 * 渡すと次に画面を触った瞬間に、過ぎた音が遅れて鳴る。
 */
export function playChime(id: ChimeId): void {
  const ctx = getSharedAudioContext();
  if (!ctx || ctx.state !== 'running') return;
  playNow(ctx, id);
}

/**
 * 「試しに鳴らす」。**利用者の操作の中で呼ぶ。** 解錠してから鳴らす（音なしのときも鳴らす・D9）。
 * ファイルがまだ読めていなければ読んでから鳴らし、読めなければ時打ちで代える。
 */
export function previewChime(id: ChimeId): void {
  unlockAudio();
  const ctx = getSharedAudioContext();
  if (ctx === null) return;
  void decodeChime(id).then(() => playNow(ctx, id));
}
