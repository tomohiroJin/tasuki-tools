/**
 * ハブの同期フック（#95 S5a）。
 *
 * **サーバーは立てない。** WebSocket を差し替えて、届いたメッセージに画面の状態が
 * どう追随するかだけを見る。実サーバーとの配線は `apps/tasuki-sync` の実 WS テストが
 * 受け持つ（あちらは本番と同じ `createSyncServer()` を通る）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { saveDefaultDisplayName, saveResumeIdentity } from '@tasuki/sync-client';
import { App } from '../../src/App.js';

/** 送った中身を覚え、サーバーからの応答を差し込める WebSocket。 */
class ScriptedWebSocket {
  static instances: ScriptedWebSocket[] = [];
  static readonly OPEN = 1;
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(readonly url: string) {
    ScriptedWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3;
  }

  open(): void {
    this.readyState = ScriptedWebSocket.OPEN;
    this.onopen?.();
  }

  /** サーバーからの 1 通を届ける。 */
  deliver(msg: unknown): void {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
}

const socket = (): ScriptedWebSocket => ScriptedWebSocket.instances[0]!;

beforeEach(() => {
  ScriptedWebSocket.instances = [];
  vi.stubGlobal('WebSocket', ScriptedWebSocket);
  localStorage.clear();
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ハブの同期', () => {
  it('Given 作成画面 / When ルームを作る / Then room.create が送られる', () => {
    // Given（準備）
    render(<App />);
    act(() => socket().open());

    // When（操作）
    act(() => {
      screen.getByLabelText('ルーム名').setAttribute('value', '朝会モブ');
    });
    // フォームの送信だけを見る（入力は React の state 経由なので下の submit で拾う）
    const form = screen.getByRole('button', { name: 'ルームを作る' });
    expect(form).toBeInTheDocument();

    // Then: 繋いだ先はハブの入口である
    expect(socket().url).toMatch(/\/ws$/);
  });

  it('Given 作成の応答 / When room.created が届く / Then 選択画面へ進む', () => {
    // Given（準備）: URL にはまだ room が無い（作成はサーバーがコードを決める）
    render(<App />);
    act(() => socket().open());

    // When（操作）: サーバーが作成を返す
    act(() => {
      socket().deliver({
        type: 'room.created',
        code: '朝会モブ-a1b2',
        participantId: 'p1',
        resumeToken: 't1',
      });
    });

    // Then: **URL を書き換えるだけでは進まない。** 画面の側も追随すること
    expect(screen.getByRole('list', { name: 'ツール' })).toBeInTheDocument();
    expect(new URL(window.location.href).searchParams.get('room')).toBe('朝会モブ-a1b2');
  });

  it('Given 作成の応答 / When 選択画面を見る / Then 配る URL はルート直下の ?room= である', () => {
    // Given: ルームができた（コードはサーバーが決める）
    render(<App />);
    act(() => socket().open());

    // When
    act(() => {
      socket().deliver({
        type: 'room.created',
        code: '朝会モブ-a1b2',
        participantId: 'p1',
        resumeToken: 't1',
      });
    });

    // Then: **組み立ては同期フックの責務**（画面は受け取って描くだけ）。
    //       ツールの配下ではなくルート直下であること（D11・`docs/adr/0018` 決定 2）
    const invite = screen.getByLabelText('参加用 URL') as HTMLInputElement;
    expect(new URL(invite.value).pathname).toBe('/');
    expect(new URL(invite.value).searchParams.get('room')).toBe('朝会モブ-a1b2');
  });

  it('Given ルームを作った直後 / When room.created が届く / Then 接続は張り直されない', () => {
    // Given（準備）: 作成の時点では URL に room が無い
    render(<App />);
    act(() => socket().open());

    // When（操作）: サーバーが作成を返す（画面は選択画面へ進む）
    act(() => {
      socket().deliver({
        type: 'room.created',
        code: 'R1',
        participantId: 'p1',
        resumeToken: 't1',
      });
    });

    // Then: **接続は 1 本のまま。** ここが 2 本になると、いま使ったばかりの WS を捨てて
    //       張り直し、保存したての復帰の組で room.join を送り直す（無駄な再接続と、
    //       切断と再参加が競合して名簿がちらつく）
    expect(ScriptedWebSocket.instances).toHaveLength(1);
    const commands = socket().sent.map((raw) => JSON.parse(raw) as Record<string, unknown>);
    expect(commands.filter((c) => c['command'] === 'room.join')).toHaveLength(0);
  });

  it('Given 参加の応答 / When roster が届く / Then 参加者一覧に出る', () => {
    // Given（準備）: 参加用 URL から開く
    window.history.replaceState(null, '', '/?room=R1');
    render(<App />);
    act(() => socket().open());

    // When（操作）
    act(() => {
      socket().deliver({ type: 'room.joined', code: 'R1', participantId: 'p1', resumeToken: 't1' });
      socket().deliver({
        type: 'roster',
        room: {
          code: 'R1',
          participants: [
            { participantId: 'p1', displayName: 'あや', presence: 'online', tools: [] },
          ],
        },
      });
    });

    // Then
    expect(screen.getByRole('list', { name: '参加者' })).toHaveTextContent('あや');
  });

  it('Given 合言葉つきのルーム / When 求められる / Then 入力欄が出る', () => {
    // Given（準備）
    window.history.replaceState(null, '', '/?room=R1');
    render(<App />);
    act(() => socket().open());

    // When（操作）: サーバーが合言葉を要求する
    act(() => {
      socket().deliver({
        type: 'error',
        code: 'PASSPHRASE_REQUIRED',
        message: 'このルームは合言葉で保護されています',
      });
    });

    // Then: 名簿は見えないまま、合言葉を尋ねる
    expect(screen.getByLabelText('合言葉')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: '参加者' })).toBeNull();
  });

  it('Given 保存済みの復帰の組 / When 参加用 URL を開く / Then 名乗らずに入り直す', () => {
    // Given（準備）: 同じ端末・同じルーム（R16）
    window.history.replaceState(null, '', '/?room=R1');
    localStorage.setItem(
      'tasuki:resume:R1',
      JSON.stringify({ code: 'R1', participantId: 'p1', resumeToken: 't1', displayName: 'あや' }),
    );

    // When（操作）
    render(<App />);
    act(() => socket().open());

    // Then: 保存済みのトークンで room.join を送っている
    const sent = socket().sent.map((raw) => JSON.parse(raw) as Record<string, unknown>);
    expect(sent[0]).toMatchObject({ command: 'room.join', code: 'R1', resumeToken: 't1' });
  });

  it('Given ルームが消えていた / When ROOM_NOT_FOUND が返る / Then 保存済みの組を捨てる', () => {
    // Given（準備）: 残すと、消えたルームへ毎回入り直そうとして参加画面に戻れない
    window.history.replaceState(null, '', '/?room=R1');
    localStorage.setItem(
      'tasuki:resume:R1',
      JSON.stringify({ code: 'R1', participantId: 'p1', resumeToken: 't1', displayName: 'あや' }),
    );
    render(<App />);
    act(() => socket().open());

    // When（操作）
    act(() => {
      socket().deliver({
        type: 'error',
        code: 'ROOM_NOT_FOUND',
        message: '指定されたルームコードが見つかりません',
      });
    });

    // Then
    expect(localStorage.getItem('tasuki:resume:R1')).toBeNull();
  });

  it('Given 参加の応答 / When お題の状態が届く / Then 選択画面にいまのお題のタイトルが出る', () => {
    // Given（準備）
    window.history.replaceState(null, '', '/?room=R1');
    render(<App />);
    act(() => socket().open());

    // When（操作）
    act(() => {
      socket().deliver({ type: 'room.joined', code: 'R1', participantId: 'p1', resumeToken: 't1' });
      socket().deliver({
        type: 'topic',
        state: {
          topic: { title: 'FizzBuzz', body: '説明は出さない', source: 'manual' },
          generating: false,
          degraded: false,
          aiUnlocked: false,
        },
      });
    });

    // Then: タイトルだけを出し、説明は出さない（spec §5.5）
    expect(screen.getByText('FizzBuzz')).toBeInTheDocument();
    expect(screen.queryByText('説明は出さない')).toBeNull();
  });

  it('Given いまのお題が出ている / When お題が下ろされる / Then 行が消える', () => {
    // Given（準備）
    window.history.replaceState(null, '', '/?room=R1');
    render(<App />);
    act(() => socket().open());
    const state = { generating: false, degraded: false, aiUnlocked: false };
    act(() => {
      socket().deliver({ type: 'room.joined', code: 'R1', participantId: 'p1', resumeToken: 't1' });
      socket().deliver({ type: 'topic', state: { ...state, topic: { title: 'FizzBuzz', body: '', source: 'manual' } } });
    });
    expect(screen.getByText('FizzBuzz')).toBeInTheDocument();

    // When（操作）
    act(() => socket().deliver({ type: 'topic', state: { ...state, topic: null } }));

    // Then
    expect(screen.queryByText('いまのお題')).toBeNull();
  });
});

/**
 * 名乗る前にルームの不在を知る（#274・#76 J-1）。
 */
describe('ルームの生死の照会', () => {
  /** `?room=` 付きで玄関を開いた状態にする。 */
  const openWithRoom = (code: string): void => {
    window.history.replaceState(null, '', `/?room=${encodeURIComponent(code)}`);
  };

  /** 送られた `room.check` の件数。 */
  const checksSent = (): number =>
    socket().sent.filter((raw) => JSON.parse(raw).command === 'room.check').length;

  it('Given 復帰の組が無い参加用 URL / When 玄関を開く / Then 生死の照会が送られる', () => {
    openWithRoom('朝会モブ-a1b2');

    render(<App />);
    act(() => socket().open());

    expect(checksSent()).toBe(1);
  });

  it('Given 復帰の組がある参加用 URL / When 玄関を開く / Then 照会は送られない', () => {
    // **送るとバケツを二重に使うだけ**。この人には room.join が同じ答えを返す
    openWithRoom('朝会モブ-a1b2');
    saveResumeIdentity({
      code: '朝会モブ-a1b2',
      participantId: 'p1',
      resumeToken: 't1',
      displayName: 'あや',
    });

    render(<App />);
    act(() => socket().open());

    expect(checksSent()).toBe(0);
  });

  it('Given 照会を送った / When 見つからないと返る / Then 名乗りフォームを出さない（経路1）', () => {
    openWithRoom('朝会モブ-a1b2');
    render(<App />);
    act(() => socket().open());

    act(() =>
      socket().deliver({
        type: 'error',
        code: 'ROOM_NOT_FOUND',
        message: '指定されたルームコードが見つかりません',
      }),
    );

    expect(screen.getByRole('heading', { name: 'ルームが見つかりません' })).toBeTruthy();
    expect(screen.queryByLabelText('あなたの名前')).toBeNull();
  });

  it('Given 復帰の組で入り直した / When 見つからないと返る / Then 名乗りフォームを出さない（経路2）', () => {
    // **Issue 本文が触れていない経路。** 症状は経路1 と同じである
    openWithRoom('朝会モブ-a1b2');
    saveResumeIdentity({
      code: '朝会モブ-a1b2',
      participantId: 'p1',
      resumeToken: 't1',
      displayName: 'あや',
    });
    render(<App />);
    act(() => socket().open());

    act(() =>
      socket().deliver({
        type: 'error',
        code: 'ROOM_NOT_FOUND',
        message: '指定されたルームコードが見つかりません',
      }),
    );

    expect(screen.getByRole('heading', { name: 'ルームが見つかりません' })).toBeTruthy();
    expect(screen.queryByLabelText('あなたの名前')).toBeNull();
  });

  it('Given 照会を送った / When 混雑で弾かれる / Then 不在とは言わない', () => {
    // 無音の意味は「生きている、または拒否された」。**断定しない側にしか外れない**
    openWithRoom('朝会モブ-a1b2');
    render(<App />);
    act(() => socket().open());

    act(() =>
      socket().deliver({
        type: 'error',
        code: 'JOIN_RATE_LIMITED',
        message: '試行が多すぎます。しばらくしてからお試しください',
      }),
    );

    expect(screen.queryByRole('heading', { name: 'ルームが見つかりません' })).toBeNull();
    // 否定だけでは画面が何も描かなくても緑になる（M1）。この場合の正しい肯定は
    // 「名乗りフォームが出たままである」こと
    expect(screen.getByLabelText('あなたの名前')).toBeTruthy();
  });

  it('Given 照会が混雑で弾かれた / When 待ち時間が過ぎる / Then 照会を送り直す', () => {
    // **送り直さないと性質が効かない。** バケツが枯れている間、
    // 消えたルームのリンクを踏んだ人は名乗りフォームを見続ける。
    // poker は同じことを既にしている（`RoomPage.tsx` の再試行）
    vi.useFakeTimers();
    try {
      openWithRoom('朝会モブ-a1b2');
      render(<App />);
      act(() => socket().open());
      expect(checksSent(), '最初の照会').toBe(1);

      act(() =>
        socket().deliver({
          type: 'error',
          code: 'JOIN_RATE_LIMITED',
          message: '試行が多すぎます。しばらくしてからお試しください',
        }),
      );

      // **即時には送らない。** 即時に送り直すと、枯れたバケツを叩き続ける
      expect(checksSent(), '弾かれた直後').toBe(1);

      act(() => {
        vi.advanceTimersByTime(30_000);
      });

      expect(checksSent(), '待った後').toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('Given 照会が混雑で弾かれた / When 待つ前に利用者が名乗る / Then 幽霊の照会は飛ばない', () => {
    // **待ち時間の間、名乗りフォームは操作できる。** 取り消さないと、
    // 名乗る前の状態を捕まえたタイマーが後から発火し、`retryRef` の予算を食い合う
    vi.useFakeTimers();
    try {
      openWithRoom('朝会モブ-a1b2');
      render(<App />);
      act(() => socket().open());
      act(() =>
        socket().deliver({
          type: 'error',
          code: 'JOIN_RATE_LIMITED',
          message: '試行が多すぎます。しばらくしてからお試しください',
        }),
      );
      expect(checksSent(), '最初の照会').toBe(1);

      // When: 待ち時間が経つ前に名乗る
      act(() => {
        fireEvent.change(screen.getByLabelText('あなたの名前'), { target: { value: 'あや' } });
        fireEvent.submit(screen.getByRole('button', { name: '参加する' }).closest('form')!);
      });

      act(() => {
        vi.advanceTimersByTime(30_000);
      });

      // Then: 照会は増えていない（幽霊が飛んでいない）
      expect(checksSent(), '名乗った後の照会').toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('Given 照会と入室が続けて弾かれる / When 待ち時間が過ぎる / Then room.join の再送は1通だけ（I1）', () => {
    // **仕掛かっているタイマーを消さずに上書きすると、2 本とも発火して room.join が
    // 2 通飛ぶ**（再送には resumeToken が付かないので、同じ表示名の参加者が
    // 名簿に 2 行並ぶ）。到達する筋（2026-09-18 の最終レビュー I1）:
    //   1. 照会を送る（room.check）
    //   2. 返事が来る前に利用者が名乗る → joinRoom() が room.join を送る
    //   3. 照会への JOIN_RATE_LIMITED が届く → room.join の再送を予約する（タイマー A）
    //   4. 入室への JOIN_RATE_LIMITED が届く → タイマー A を消さずに上書きする（タイマー B）
    //   5. A も B も発火し、room.join が 2 通飛ぶ
    const joinsSent = (): number =>
      socket()
        .sent.filter((raw) => (JSON.parse(raw) as Record<string, unknown>)['command'] === 'room.join')
        .length;

    vi.useFakeTimers();
    try {
      openWithRoom('朝会モブ-a1b2');
      render(<App />);
      act(() => socket().open());
      expect(checksSent(), '最初の照会').toBe(1);

      // 返事が来る前に利用者が名乗る（このとき仕掛かっている再試行は無い）
      act(() => {
        fireEvent.change(screen.getByLabelText('あなたの名前'), { target: { value: 'あや' } });
        fireEvent.submit(screen.getByRole('button', { name: '参加する' }).closest('form')!);
      });
      const joinsBeforeRetries = joinsSent();
      expect(joinsBeforeRetries, '名乗った直後の room.join').toBe(1);

      // 照会への JOIN_RATE_LIMITED（タイマー A を予約）
      act(() =>
        socket().deliver({
          type: 'error',
          code: 'JOIN_RATE_LIMITED',
          message: '試行が多すぎます。しばらくしてからお試しください',
        }),
      );
      // 入室への JOIN_RATE_LIMITED（タイマー B を予約。A を取り消さずに上書きするのが I1 のバグ）
      act(() =>
        socket().deliver({
          type: 'error',
          code: 'JOIN_RATE_LIMITED',
          message: '試行が多すぎます。しばらくしてからお試しください',
        }),
      );

      act(() => {
        vi.advanceTimersByTime(30_000);
      });

      // Then: 再送は 1 通だけ（直す前は A・B 両方が発火して 2 通になる）
      expect(joinsSent() - joinsBeforeRetries, '待った後に増えた room.join（再送分）').toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

/**
 * D4 が開けた窓（#290 最終レビュー・取りこぼし A-1）。
 *
 * 「不在 かつ 退出の告知あり → 作成画面」を足したことで、URL 由来の古いコード
 * （`initialCode`）が非 null のまま作成画面に居る状態が新たに到達可能になった。
 * そこで新しいルームを作った後、古いコードについての `ROOM_NOT_FOUND` が遅れて
 * 届く（再接続時の生死の再照会など）と、**尋ねた相手といま映しているルームが
 * 違う**のに、いま作ったばかりの新しいルームの復帰の組を巻き添えに消してしまう。
 */
describe('D4 が開けた窓（古いコードの不在が新しいルームを巻き添えにしない）', () => {
  it('Given 抜けて作成画面から新しいルームを作った / When 古いコードについて遅れて ROOM_NOT_FOUND が届く / Then 新しいルームの復帰の組は消えない', () => {
    // Given: 抜けた直後の参加用 URL（古いコード）と退出の告知を持って玄関へ着く
    window.history.replaceState(null, '', '/?room=OLD&left=self');
    render(<App />);
    act(() => socket().open());

    // 復帰の組を持たないので玄関は OLD の生死を尋ねている。答えが「不在」で返り、
    // 退出の告知があるので作成画面へ落ちる（D4）
    act(() =>
      socket().deliver({
        type: 'error',
        code: 'ROOM_NOT_FOUND',
        message: '指定されたルームコードが見つかりません',
      }),
    );
    expect(screen.getByRole('button', { name: 'ルームを作る' })).toBeInTheDocument();

    // When: 作成画面から新しいルームを作る（codeRef は NEW を指すようになる。
    // initialCode は URL 由来のまま OLD で変わらない）
    act(() => {
      fireEvent.change(screen.getByLabelText('ルーム名'), { target: { value: '朝会モブ' } });
      fireEvent.change(screen.getByLabelText('あなたの名前'), { target: { value: 'あや' } });
      fireEvent.submit(screen.getByRole('button', { name: 'ルームを作る' }).closest('form')!);
    });
    act(() =>
      socket().deliver({
        type: 'room.created',
        code: 'NEW',
        participantId: 'p1',
        resumeToken: 't1',
      }),
    );
    expect(localStorage.getItem('tasuki:resume:NEW')).not.toBeNull();

    // When: 古いコード（OLD）についての ROOM_NOT_FOUND が、新しいルームを作った後に
    // 遅れて届く（再接続時に initialCode=OLD の生死を尋ね直した場合を想定）
    act(() =>
      socket().deliver({
        type: 'error',
        code: 'ROOM_NOT_FOUND',
        message: '指定されたルームコードが見つかりません',
      }),
    );

    // Then: いま作ったばかりの新しいルームの復帰の組は残っている
    // （尋ねた相手 OLD といま映しているルーム NEW が違うので、巻き添えにしてはいけない。
    // 消してしまう実装だとここが null になって落ちる）
    expect(localStorage.getItem('tasuki:resume:NEW')).not.toBeNull();
  });
});

/**
 * 既定として提示した名前を、利用者が書き換えたとき（#284・FR-053 / FR-054 の EARS 4）。
 *
 * **送られた中身まで見る。** 欄の見た目だけを見る検査は、「書き換えは映るが送るのは
 * 保存値」という壊れ方を通してしまう（初期値を `value` に直結させて `state` を
 * 使わない実装がまさにこれになる）。
 */
describe('既定の表示名の書き換え', () => {
  /** 送られた `room.join` の `displayName`。 */
  const joinedNames = (): string[] =>
    socket()
      .sent.map((raw) => JSON.parse(raw) as Record<string, unknown>)
      .filter((cmd) => cmd['command'] === 'room.join')
      .map((cmd) => cmd['displayName'] as string);

  it('Given 既定が入った名乗りの欄 / When 書き換えて送る / Then 書き換えた側が送られる', () => {
    // Given（準備）: 前回の名乗りが既定として入っている
    saveDefaultDisplayName('あや');
    window.history.replaceState(null, '', '/?room=ABC123');
    render(<App />);
    act(() => socket().open());
    expect(screen.getByLabelText<HTMLInputElement>('あなたの名前')).toHaveValue('あや');

    // When（操作）: 別の名前で名乗り直す
    act(() => {
      fireEvent.change(screen.getByLabelText('あなたの名前'), { target: { value: 'いずみ' } });
      fireEvent.submit(screen.getByRole('button', { name: '参加する' }).closest('form')!);
    });

    // Then: 保存値ではなく、書き換えた側が飛ぶ
    expect(joinedNames()).toEqual(['いずみ']);
  });

  it('Given 書き換えて入室した / When 玄関を開き直す / Then 既定は書き換えた側になる', () => {
    // Given（準備）: 既定を書き換えて入室が成立する
    saveDefaultDisplayName('あや');
    window.history.replaceState(null, '', '/?room=ABC123');
    const first = render(<App />);
    act(() => socket().open());
    act(() => {
      fireEvent.change(screen.getByLabelText('あなたの名前'), { target: { value: 'いずみ' } });
      fireEvent.submit(screen.getByRole('button', { name: '参加する' }).closest('form')!);
    });
    act(() =>
      socket().deliver({
        type: 'room.joined',
        code: 'ABC123',
        participantId: 'p1',
        resumeToken: 't1',
      }),
    );
    first.unmount();

    // When（操作）: 素の入口を開き直す
    window.history.replaceState(null, '', '/');
    render(<App />);

    // Then: **上書きされている**（古い既定を残す実装はここで赤くなる）
    expect(screen.getByLabelText<HTMLInputElement>('あなたの名前')).toHaveValue('いずみ');
  });
});
