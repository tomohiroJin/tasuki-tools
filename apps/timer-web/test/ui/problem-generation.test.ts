/**
 * お題の生成中／縮退の表示を決める純関数（#283）。
 *
 * **判定の材料はサーバーが送る帳簿だけである。** かつてはお題の内容差分
 * （前後の snapshot の title / source）で「生成が終わった」を推測していたが、
 * 同じお題が選び直されると差分が出ず、途中から繋ぎ直した端末は前の snapshot を
 * そもそも持たない。どちらも「降りない」側へ倒れる。ここに内容差分を戻さないこと。
 *
 * @requirements #283 EARS 1・EARS 2・EARS 3
 */
import { describe, it, expect } from "vitest";
import {
  isGeneratingProblem,
  showsFallbackNotice,
} from "../../src/ui/problem-generation.js";
import { aRoomView } from "../support/room-view.js";

describe("isGeneratingProblem", () => {
  it("サーバーが生成中と言っているなら true", () => {
    const room = aRoomView({ problemGeneration: { active: true, degraded: false } });
    expect(isGeneratingProblem(room)).toBe(true);
  });

  it("サーバーが生成中ではないと言っているなら false", () => {
    // **縮退の印が立っていても、生成中ではないなら false である**
    //（印は直前の生成の結末を表すもので、待ちの有無とは別の情報）。
    const room = aRoomView({ problemGeneration: { active: false, degraded: true } });
    expect(isGeneratingProblem(room)).toBe(false);
  });

  it("帳簿そのものが無ければ false（旧サーバーの snapshot・配布の窓）", () => {
    // `deploy.sh timer` は画面を先に配るので「新しい画面 × 旧サーバー」の窓が開く。
    // **無いものを内容差分で推測しない** —— それを落とすことが #283 の目的である。
    expect(isGeneratingProblem(aRoomView())).toBe(false);
  });

  it("ルームがまだ無ければ false", () => {
    expect(isGeneratingProblem(null)).toBe(false);
  });
});

describe("showsFallbackNotice", () => {
  it("生成が終わっていて AI から定型へ落ちていたなら true", () => {
    const room = aRoomView({ problemGeneration: { active: false, degraded: true } });
    expect(showsFallbackNotice(room)).toBe(true);
  });

  it("まだ生成中なら出さない（結末が決まっていない）", () => {
    // 走っている最中に「定型になりました」と言うと、そのあと AI で作れた場合に嘘になる。
    const room = aRoomView({ problemGeneration: { active: true, degraded: true } });
    expect(showsFallbackNotice(room)).toBe(false);
  });

  it("縮退していないなら false", () => {
    const room = aRoomView({ problemGeneration: { active: false, degraded: false } });
    expect(showsFallbackNotice(room)).toBe(false);
  });

  it("帳簿そのものが無ければ false", () => {
    expect(showsFallbackNotice(aRoomView())).toBe(false);
  });

  it("ルームがまだ無ければ false", () => {
    expect(showsFallbackNotice(null)).toBe(false);
  });
});
