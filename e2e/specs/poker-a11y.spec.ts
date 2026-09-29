/**
 * poker の文字が背景に対して読めること（#91 PR 3）。
 *
 * **タグを付けない（`local` 専用）。** 理由は `timer-a11y.spec.ts` と同じ
 * （`PRODUCTION_TAGS` は `@smoke` / `@core` だけ。見るのはスタイルの健全性）。
 *
 * poker にはこれまで文字の走査が無かった（PR #311 の申し送り）。お題の表示（`CurrentTopic`）を
 * 足したのを機に、**お題を出したルーム画面**を測る。説明（象牙の札）は開いてから測る ——
 * 畳んだままだと `:visible` から外れ、札の上の字（`--coal` on `--ivory`）を誰も見ない。
 *
 * **初回の走査（探索）で既存の要素が 2 件 AA を割った**: 節の見出し「参加者（1人）」「あなたのカード」
 * （`@tasuki/ui` の既定の h2・`--gold` を地の無いまま body の羅紗グラデーションに置く）が 3.92:1。
 * poker の CSS で節の見出しに felt-900 の地を与えて直した（`apps/poker-web/src/index.css`）。
 */
import { expect, test } from '../fixtures/test';
import { expectReadable, pairKey, resolveColors, scanContrast } from '../support/a11y';
import { chooseCard, createRoom, joinRoom, resultsSection } from '../support/poker';
import { openTopicTool, setTopic } from '../support/topic';

/** 文面は書体の常用の層に収まるもの（`topic.spec.ts` と同じ）。 */
const TITLE = 'FizzBuzz';
const BODY = '3 のときは Fizz を出す';

test.describe('poker の文字が背景に対して読める（WCAG AA）', () => {
  test('Given お題を出した poker のルーム / When 説明を開いて文字を測り、票を公開して測る / Then すべて AA を満たす', async ({
    page,
    openPeer,
  }) => {
    // Given: お題ツールでお題を掲げ、別の文脈で poker を開いて説明を開く
    const inviteUrl = await openTopicTool(page, 'a11y-topic');
    await setTopic(page, TITLE, BODY);
    const poker = await openPeer('a11y-poker');
    await joinRoom(poker.page, inviteUrl, 'a11y-poker');
    const topic = poker.page.getByRole('region', { name: 'お題', exact: true });
    await topic.getByText('説明を見る', { exact: true }).click();
    await expect(topic.getByText(BODY, { exact: true })).toBeVisible();
    // 固定する 2 組: 節の見出し（`--gold` on `--felt-900`。初回の走査で地が無く 3.92:1 だった）と、
    //   象牙の札の上の字（`--coal` on `--ivory`）。画面の作りが変わって測らなくなったら落とす
    const [gold, felt900, coal, ivory] = await resolveColors(poker.page, ['--gold', '--felt-900', '--coal', '--ivory']);
    const thinnest = [pairKey(gold!, felt900!), pairKey(coal!, ivory!)];

    // When / Then その1: 投票中の画面
    expectReadable(await scanContrast(poker.page, 10), 8, thinnest);

    // When / Then その2: 公開後の画面（「結果」の見出しと集計は公開後にしか出ない）。
    //   poker に居るのは 1 人なので、1 票で全員が投じたことになり自動で公開される
    await chooseCard(poker.page, '5');
    await expect(resultsSection(poker.page)).toBeVisible();
    expectReadable(await scanContrast(poker.page, 10), 8, [pairKey(gold!, felt900!)]);
  });

  test('Given 2 人のルームで 1 人だけが投票 / When 票を公開する / Then 未投票の印も AA を満たす', async ({ page, openPeer }) => {
    // Given: 2 人目が居るので、1 人が投票しても自動では公開されない
    const inviteUrl = await createRoom(page, 'a11y-voter');
    const idle = await openPeer('a11y-idle');
    await joinRoom(idle.page, inviteUrl, 'a11y-idle');
    await chooseCard(page, '5');

    // When: 投票した側が票を公開する
    await page.getByRole('button', { name: '票を公開する' }).click();
    await expect(resultsSection(page)).toBeVisible();
    await expect(resultsSection(page).getByText('未投票', { exact: true })).toBeVisible();

    // Then: 未投票の印（`.no-vote`）を含めて、画面の字がすべて AA を満たす
    const scan = await scanContrast(page, 8);
    expectReadable(scan, 6, []);
    //   未投票の印（`--ivory-faint` on 票の行の沈んだ敷き `--felt-sink`）を測ったことも固定する。
    //   地の記述は羅紗の重なりまで続くので、先頭の組で照合する。印が走査の外の要素（`<div>` など）に
    //   変わると AA の判定は緑のまま、印を誰も測らなくなる（#320 PR 5 の最終レビュー）
    const [faint, sink] = await resolveColors(page, ['--ivory-faint', '--felt-sink']);
    const noVote = pairKey(faint!, sink!);
    expect([...scan.pairs].some((p) => p.startsWith(noVote)), `未投票の印（${noVote}）を測っていない`).toBe(true);
  });
});
