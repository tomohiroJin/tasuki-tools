/**
 * やり方ごとの文言（#406・設計 §3）。お題・札の名前・凡例の短い意味。
 *
 * 札の**名前**は札の顔に出さない（凡例・山の下・読み上げ `aria-label` にだけ使う）。
 * 鍵は checkin-core の `METHOD_IDS` と、各やり方の `METHODS[m].cards` に一致させる（`tests/method-copy.test.ts` が守る）。
 * **文言は書体の base 層に収める**（`tests/copy-fits-font-base.test.ts` が守る）。
 */
import type { CardId, MethodId } from '@tasuki/checkin-core';

export interface CardCopy {
  /** 凡例・山の下・読み上げに使う札の名前 */
  readonly name: string;
  /** 凡例の短い意味 */
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
  roti: {
    title: 'ROTI（時間に見合ったか）',
    prompt: 'この時間、使った分の価値はありましたか？',
    cards: {
      '1': { name: '1', meaning: '時間のむだ' },
      '2': { name: '2', meaning: 'ひとつ学べた' },
      '3': { name: '3', meaning: '使った分だけ' },
      '4': { name: '4', meaning: 'かなり学べた' },
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
};
