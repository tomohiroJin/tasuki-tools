/**
 * apps/web テスト共有フェイク（新設6・G2-c・T027）
 *
 * 以前は `test/platform/sound.test.ts` の同一ファイル内に FakeAudio が5回、
 * FakeOsc / FakeGain が各2回、別々に定義されていた（複数ファイルではなく複数箇所の重複）。
 * また `test/sync/client.dispose.test.ts` と `test/sync/client.connection.test.ts` に
 * 同一の FakeWS が重複定義されていた。
 * ここに集約し、各定義の微妙な違い（記録の仕方・成功/失敗の切り替え）の和集合を取る。
 *
 * @requirements FR-097, SC-028, US2
 */

/** Web Audio の AudioBufferSourceNode/OscillatorNode 相当の最小フェイク。 */
export class FakeOsc {
  type = "sine";
  frequency = { value: 0 };

  /** start() を検知したいテストのためのフック（省略可）。 */
  constructor(private readonly onStart?: () => void) {}

  connect(): void {}
  start(): void {
    this.onStart?.();
  }
  stop(): void {}
}

/** Web Audio の GainNode 相当の最小フェイク。 */
export class FakeGain {
  gain = {
    setValueAtTime(): void {},
    exponentialRampToValueAtTime(): void {},
  };

  connect(): void {}
}

type PlayResult = "resolve" | "reject";

/**
 * `Audio` コンストラクタの最小フェイク。
 * 生成時・play() 呼び出し時に外部へ通知するフック、play() の成功/失敗の切り替え、
 * error イベントハンドラの手動発火（fireError）をサポートする（元の5定義の和集合）。
 *
 * static なフックは `globalThis.Audio` を差し替えるテストの間で共有されるため、
 * 各テストは使い終わったら `FakeAudio.reset()` で既定へ戻すこと。
 */
export class FakeAudio {
  /**
   * 生成時に呼ばれるフック。**生成されたインスタンス自身も渡す。**
   * 生成後のインスタンスへ `fireError()` を送りたいテストが 2 箇所あり、
   * これが無いと各テストが FakeAudio を継承して `this` を掴む必要が生じるため。
   */
  static onCreate: ((src: string, instance: FakeAudio) => void) | undefined;
  static onPlay: ((src: string) => void) | undefined;
  static playResult: PlayResult = "resolve";

  static reset(): void {
    FakeAudio.onCreate = undefined;
    FakeAudio.onPlay = undefined;
    FakeAudio.playResult = "resolve";
  }

  src: string;
  volume = 1;
  private readonly handlers: Partial<Record<string, () => void>> = {};

  constructor(src: string) {
    this.src = src;
    FakeAudio.onCreate?.(src, this);
  }

  addEventListener(event: string, handler: () => void): void {
    this.handlers[event] = handler;
  }

  /** テストから error イベントを手動発火する（addEventListener("error", ...) の相手）。 */
  fireError(): void {
    this.handlers.error?.();
  }

  play(): Promise<void> {
    FakeAudio.onPlay?.(this.src);
    return FakeAudio.playResult === "reject"
      ? Promise.reject(new Error("blocked"))
      : Promise.resolve();
  }
}

/** onopen/onclose/onmessage を手動発火できる最小 WebSocket スタブ。 */
export class FakeWS {
  static instances: FakeWS[] = [];
  static readonly OPEN = 1;

  readyState = 0;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(public url: string) {
    FakeWS.instances.push(this);
  }

  // 引数を受け取る形にしておく。送信内容を検証するテストは vi.spyOn(ws, "send") で
  // 呼び出し引数を読むため、シグネチャが `()` だと型が空タプルになり参照できない。
  send(_data?: string): void {}
  close(): void {}
}
