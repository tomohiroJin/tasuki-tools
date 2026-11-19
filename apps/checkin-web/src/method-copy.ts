/**
 * やり方ごとの文言（#406・設計 §3）。お題・札の名前・凡例の短い意味。
 *
 * 札の**名前**は札の顔に出さない（凡例・手札の札の下・山の下・読み上げに使う。手札の札の下には意味も添える・#480）。
 * 鍵は checkin-core の `METHOD_IDS` と、各やり方の `METHODS[m].cards` に一致させる（`tests/method-copy.test.ts` が守る）。
 * **文言は書体の base 層に収める**（`tests/copy-fits-font-base.test.ts` が守る）。
 */
import type { CardId, MethodId } from '@tasuki/checkin-core';

export interface CardCopy {
  /** 凡例・手札の札の下・山の下・読み上げに使う札の名前 */
  readonly name: string;
  /** 凡例と手札の札の下に出す短い意味（手札では札のボタンの説明として読む） */
  readonly meaning: string;
}

export interface MethodCopy {
  /** お題の枠の小見出しに出すやり方の名前 */
  readonly title: string;
  /** 問いの文 */
  readonly prompt: string;
  readonly cards: Readonly<Record<CardId, CardCopy>>;
}

export const METHOD_COPY: Readonly<Record<MethodId, MethodCopy>> = {
  weather: {
    title: '今日の天気',
    prompt: '今日のあなたの空模様は？',
    cards: {
      sunny: { name: '晴れ', meaning: '絶好調' },
      cloudy: { name: 'くもり', meaning: 'まあまあ' },
      rain: { name: '雨', meaning: 'ちょっと沈み気味' },
      thunder: { name: '雷', meaning: '荒れ模様・余裕がない' },
    },
  },
  energy: {
    title: '元気メーター',
    prompt: 'いまの元気はどのくらいですか？',
    cards: {
      '1': { name: '1', meaning: 'ぐったり' },
      '2': { name: '2', meaning: 'ちょっとお疲れ' },
      '3': { name: '3', meaning: 'ふつう' },
      '4': { name: '4', meaning: '元気' },
      '5': { name: '5', meaning: '絶好調' },
    },
  },
  focus: {
    title: 'いま頭の何割がここに？',
    prompt: 'いま、頭の何割がこの場にありますか？',
    cards: {
      '20': { name: '2 割', meaning: '別のことで頭がいっぱい' },
      '50': { name: '5 割', meaning: '半分くらい' },
      '80': { name: '8 割', meaning: 'だいたいここに' },
      '100': { name: '10 割', meaning: '全部ここに' },
    },
  },
  'takeaway-goal': {
    title: 'この打ち合わせで持ち帰りたいもの',
    prompt: 'この打ち合わせで、何を持ち帰りたいですか？',
    cards: {
      decide: { name: '決めたい', meaning: '決めて終わりたい' },
      learn: { name: '知りたい', meaning: '情報を集めたい' },
      discuss: { name: '相談したい', meaning: '意見をもらいたい' },
      listen: { name: '聞くだけ', meaning: '聞くだけでよい' },
    },
  },
  role: {
    title: '今日の役割',
    prompt: '今日は、どの役で参加しますか？',
    cards: {
      listener: { name: '聞き役', meaning: 'しっかり聞く' },
      questioner: { name: '質問役', meaning: '気になることを聞く' },
      summarizer: { name: 'まとめ役', meaning: '話をまとめる' },
      energizer: { name: '盛り上げ役', meaning: '場を明るくする' },
    },
  },
  expectation: {
    title: '期待の大きさ',
    prompt: 'この時間に、どのくらい期待していますか？',
    cards: {
      '1': { name: '1', meaning: 'あまり期待していない' },
      '2': { name: '2', meaning: '少しだけ' },
      '3': { name: '3', meaning: 'ふつう' },
      '4': { name: '4', meaning: '期待している' },
      '5': { name: '5', meaning: '大いに期待' },
    },
  },
  'mood-start': {
    title: '始まりの気分',
    prompt: '始まる前の、いまの気分は？',
    cards: {
      eager: { name: '楽しみ', meaning: '始まるのが待ち遠しい' },
      calm: { name: '落ち着いている', meaning: 'いつもどおり' },
      sleepy: { name: '眠い', meaning: 'まだ頭が起きていない' },
      restless: { name: 'そわそわ', meaning: '気がかりがある' },
    },
  },
  roti: {
    title: 'ROTI（時間に見合ったか）',
    prompt: 'この時間、使った分の価値はありましたか？',
    cards: {
      '1': { name: '1', meaning: '時間のむだ' },
      '2': { name: '2', meaning: '少し得た' },
      '3': { name: '3', meaning: '使った分だけ' },
      '4': { name: '4', meaning: '得るものが多かった' },
      '5': { name: '5', meaning: '来てよかった' },
    },
  },
  'takeaway-done': {
    title: '持ち帰れたか',
    prompt: '持ち帰りたかったものは、持ち帰れましたか？',
    cards: {
      yes: { name: '持ち帰れた', meaning: 'ねらいどおり' },
      half: { name: '半分', meaning: '一部だけ果たせた' },
      no: { name: '持ち帰れなかった', meaning: '果たせなかった' },
    },
  },
  'best-part': {
    title: '一番よかったこと',
    prompt: 'この時間で、一番よかったことは？',
    cards: {
      decided: { name: '決まった', meaning: '話が前に進んだ' },
      talked: { name: '話せた', meaning: '言いたいことを話せた' },
      learned: { name: '知れた', meaning: '新しいことを知れた' },
      nothing: { name: '特になし', meaning: 'とくにない' },
    },
  },
  mood: {
    title: '今の気分',
    prompt: 'いまの気分は？',
    cards: {
      clear: { name: 'すっきり', meaning: '頭が晴れた' },
      foggy: { name: 'もやもや', meaning: '引っかかりが残る' },
      tired: { name: 'くたくた', meaning: 'エネルギー切れ' },
      excited: { name: 'わくわく', meaning: '続きが気になる' },
    },
  },
  'next-meeting': {
    title: '次の打ち合わせは',
    prompt: '次の打ち合わせは、どうしたいですか？',
    cards: {
      keep: { name: 'このままで', meaning: '今の形で続ける' },
      shorter: { name: '短く', meaning: '時間を短くする' },
      fewer: { name: '人を絞る', meaning: '必要な人だけで' },
      skip: { name: '無くてもいい', meaning: 'やらなくても回る' },
    },
  },
  'weather-end': {
    title: '終わりの天気',
    prompt: '終わったいま、あなたの空模様は？',
    cards: {
      sunny: { name: '晴れ', meaning: '絶好調' },
      cloudy: { name: 'くもり', meaning: 'まあまあ' },
      rain: { name: '雨', meaning: 'ちょっと沈み気味' },
      thunder: { name: '雷', meaning: '荒れ模様・余裕がない' },
    },
  },
  understanding: {
    title: 'わかった度',
    prompt: 'この時間の中身は、どのくらいわかりましたか？',
    cards: {
      '1': { name: '1', meaning: 'ほとんどわからない' },
      '2': { name: '2', meaning: '少しわかった' },
      '3': { name: '3', meaning: '半分くらい' },
      '4': { name: '4', meaning: 'だいたいわかった' },
      '5': { name: '5', meaning: 'よくわかった' },
    },
  },
  // ---- #635 で足したチェックイン ----
  readiness: {
    title: '準備の度合い',
    prompt: 'この会のための準備は、できていますか？',
    cards: {
      ready: { name: 'できている', meaning: '準備は済んでいる' },
      mostly: { name: 'だいたい', meaning: '大切なところは済んだ' },
      later: { name: 'これから', meaning: 'これから見ておく' },
      'not-yet': { name: 'まだ', meaning: '手をつけていない' },
    },
  },
  busyness: {
    title: 'いそがしさ',
    prompt: 'いまのいそがしさは、どのくらいですか？',
    cards: {
      roomy: { name: '余裕', meaning: '手が空いている' },
      normal: { name: 'ふつう', meaning: 'いつもどおり' },
      packed: { name: 'つまっている', meaning: '予定でいっぱい' },
      overflow: { name: 'あふれている', meaning: '手が回らない' },
    },
  },
  'talk-wish': {
    title: '話したい度',
    prompt: '今日は、どのくらい話したいですか？',
    cards: {
      '1': { name: '1', meaning: '聞いていたい' },
      '2': { name: '2', meaning: '少しなら' },
      '3': { name: '3', meaning: 'ふつう' },
      '4': { name: '4', meaning: '話したい' },
      '5': { name: '5', meaning: 'たくさん話したい' },
    },
  },
  battery: {
    title: '今日のバッテリー',
    prompt: 'あなたのバッテリーは、どのくらい残っていますか？',
    cards: {
      full: { name: '満タン', meaning: '元気いっぱい' },
      half: { name: '半分', meaning: 'ふつうに動ける' },
      low: { name: '少ない', meaning: '少し無理している' },
      empty: { name: '切れそう', meaning: 'もう動けない' },
    },
  },
  clarity: {
    title: 'この会の理解',
    prompt: 'この会のねらいと進め方は、わかっていますか？',
    cards: {
      both: { name: 'どちらもわかる', meaning: 'ねらいも進め方もわかる' },
      purpose: { name: 'ねらいだけ', meaning: '進め方はまだあいまい' },
      unclear: { name: 'どちらもあいまい', meaning: '何をする会かわからない' },
    },
  },
  worry: {
    title: '今日の気がかり',
    prompt: 'いま、気になっていることはありますか？',
    cards: {
      none: { name: '無い', meaning: '気がかりはない' },
      some: { name: '少しある', meaning: '頭のすみにある' },
      big: { name: '大きいのがある', meaning: '頭から離れない' },
    },
  },
  // ---- #635 で足したチェックアウト ----
  agreement: {
    title: 'なっとく度',
    prompt: '決まったことに、どのくらいなっとくしていますか？',
    cards: {
      '1': { name: '1', meaning: 'なっとくしていない' },
      '2': { name: '2', meaning: '少し引っかかる' },
      '3': { name: '3', meaning: '半分くらい' },
      '4': { name: '4', meaning: 'だいたいなっとく' },
      '5': { name: '5', meaning: 'しっかりなっとく' },
    },
  },
  'next-step': {
    title: '次の一手',
    prompt: 'このあと自分が何をするか、見えていますか？',
    cards: {
      clear: { name: 'はっきりした', meaning: 'やることが決まった' },
      mostly: { name: 'だいたい', meaning: 'おおよそ見えている' },
      vague: { name: 'ぼんやり', meaning: '形だけ見えている' },
      unknown: { name: 'わからない', meaning: '何をするか見えない' },
    },
  },
  voice: {
    title: '話せたか',
    prompt: '言いたいことは、話せましたか？',
    cards: {
      plenty: { name: 'たっぷり話せた', meaning: '言いたいことを言えた' },
      some: { name: '少し話せた', meaning: '一部は言えた' },
      none: { name: '話せなかった', meaning: '言いそびれた' },
    },
  },
  pace: {
    title: '進むペース',
    prompt: 'この会の進み方は、どうでしたか？',
    cards: {
      fast: { name: 'はやすぎ', meaning: 'ついていけなかった' },
      right: { name: 'ちょうど', meaning: 'ほどよかった' },
      slow: { name: 'ゆっくりすぎ', meaning: 'もっと進めたかった' },
    },
  },
  fatigue: {
    title: '残った疲れ',
    prompt: '終わったいま、どのくらい疲れていますか？',
    cards: {
      fine: { name: '元気', meaning: 'まだまだ動ける' },
      bit: { name: '少し疲れた', meaning: '少しのんびりしたい' },
      very: { name: 'かなり疲れた', meaning: 'もう動けない' },
    },
  },
  message: {
    title: 'だれかに言いたいこと',
    prompt: 'だれかに言っておきたいことは、ありますか？',
    cards: {
      now: { name: 'このあと話す', meaning: '終わる前にこの場で話す' },
      later: { name: 'あとで言う', meaning: '会のあとで相手に言う' },
      none: { name: '無い', meaning: '言いたいことはない' },
    },
  },
};
