/**
 * poker の文字が背景に対して読めること（#91 PR 3）。
 *
 * **タグを付けない（`local` 専用）。** 理由は `timer-a11y.spec.ts` と同じ
 * （`PRODUCTION_TAGS` は `@smoke` / `@core` だけ。見るのはスタイルの健全性）。
 *
 * poker にはこれまで文字の走査が無かった（PR #311 の申し送り）。お題の表示（`CurrentTopic`）を
 * 足したのを機に、**お題を出したルーム画面**を測る。お題は読む面（象牙の札）に畳まずに出るので、
 * 札の上の字（`--coal` on `--ivory`）と見出し（`--coal-soft` on 札の地）を測る（#316）。
 *
 * **初回の走査（探索）で既存の要素が 2 件 AA を割った**: 節の見出し「参加者（1人）」「あなたのカード」
 * （当時の h2 は `--gold` の字を地の無いまま body の羅紗グラデーションに置いていた）が 3.92:1。
 * 当時は poker の CSS で見出しに felt-900 の帯を敷いて直した。#316 PR 2 で要素層の h2 が象牙（`--ivory`）になり、
 * 帯は外した。節の見出しは羅紗の上の象牙として測る（地は羅紗の重なりまで続くので、先頭の組で照合する）。
 */
import { expect, test } from '../fixtures/test';
import { expectReadable, pairKey, resolveColors, scanContrast } from '../support/a11y';
import { chooseCard, createRoom, joinRoom, participantRow, recordSeatFlips, resultsSection, seatFlips } from '../support/poker';
import { openTopicTool, setTopic } from '../support/topic';

/** 文面は書体の常用の層に収まるもの（`topic.spec.ts` と同じ）。 */
const TITLE = 'FizzBuzz';
const BODY = '3 のときは Fizz を出す';

test.describe('poker の文字が背景に対して読める（WCAG AA）', () => {
  test('Given お題を出した poker のルーム / When 読む面の文字を測り、票を公開して測る / Then すべて AA を満たす', async ({
    page,
    openPeer,
  }) => {
    // Given: お題ツールでお題を掲げ、別の文脈で poker を開く
    const inviteUrl = await openTopicTool(page, 'a11y-topic');
    await setTopic(page, TITLE, BODY);
    const poker = await openPeer('a11y-poker');
    // 動きを抑える設定（#348）。お題の出し入れの遅延も止まることを、公開後の走査の後に見る
    await poker.page.emulateMedia({ reducedMotion: 'reduce' });
    await joinRoom(poker.page, inviteUrl, 'a11y-poker');
    const topic = poker.page.getByRole('region', { name: 'お題', exact: true });
    await expect(topic.getByRole('region', { name: TITLE, exact: true }).getByText(BODY, { exact: true })).toBeVisible();
    await expect(topic.getByRole('button', { name: '続きを読む' })).toBeHidden();
    // 固定する組: 象牙の札の上の字（`--coal` on `--ivory`）と、札の上のお題の見出し（`--coal-soft` on 札の地）。
    //   画面の作りが変わって測らなくなったら落とす
    //   読む面の札の地は単色でなくグラデーション（`.ui-reader`）なので、地の記述はその形で組む
    const [ivory, coal, coalSoft, sheen, shade] = await resolveColors(poker.page, [
      '--ivory', '--coal', '--coal-soft', '--card-sheen', '--card-shade',
    ]);
    const cardGround = `rgba(0, 0, 0, 0) + linear-gradient(160deg, ${sheen}, ${shade})`;
    const thinnest = [pairKey(coal!, cardGround), pairKey(coalSoft!, cardGround)];

    // When / Then その1: 投票中の画面
    const voting = await scanContrast(poker.page, 10);
    expectReadable(voting, 8, thinnest);
    //   節の見出し（象牙の字）が羅紗の上で測られていること。帯を外したので地は羅紗の重なりで、その先頭は
    //   body の羅紗（`::after`）になる。重なりの残りは画面の作りで変わるので、先頭までで照合する
    const ivoryOnFelt = `${ivory!} on ::after`;
    expect([...voting.pairs].some((p) => p.startsWith(ivoryOnFelt)), `節の見出し（${ivoryOnFelt}）を測っていない`).toBe(true);

    // When / Then その2: 公開後の画面（「結果」の見出しと集計は公開後にしか出ない）。
    //   poker に居るのは 1 人なので、1 票で全員が投じたことになり自動で公開される
    await chooseCard(poker.page, '5');
    await expect(resultsSection(poker.page)).toBeVisible();
    const revealed = await scanContrast(poker.page, 10);
    //   席の札の表の字（`--coal` on 札の地のグラデーション・#348）も固定する。公開後は手札が無いので、
    //   この組を描くのは席の札の表だけ（めくりで表が裏返ったまま・背面が隠れたままだと測られない）
    const faceGround = `rgba(0, 0, 0, 0) + linear-gradient(165deg, ${sheen} 0%, ${ivory} 60%, ${shade} 100%)`;
    expectReadable(revealed, 8, [pairKey(coal!, faceGround)]);
    //   公開後にだけ出る「結果」の見出しも羅紗の上で測られていること
    expect([...revealed.pairs].some((p) => p.startsWith(ivoryOnFelt)), `公開後の見出し（${ivoryOnFelt}）を測っていない`).toBe(true);

    // When / Then その2b（#93）: 記録に束が 2 つ（閉じた束と見積もり中の束）ある状態の画面も AA を満たす。
    //   次のアイテムへ進めて閉じた束を作り、もう 1 件開票する（1 人なので投票すると自動で公開される）
    await poker.page.setViewportSize({ width: 1280, height: 900 });
    await poker.page.getByRole('button', { name: '次のアイテムへ' }).click();
    await chooseCard(poker.page, '3');
    await expect(resultsSection(poker.page)).toBeVisible();
    const log = poker.page.locator('.room-log--side');
    await expect(log.getByText('見積もり中', { exact: true }), '見積もり中の束').toBeVisible();
    await expect(log.getByRole('combobox', { name: 'ポイントを変える' }), '閉じた束のポイントの選択').toHaveCount(1);
    await expect(log.locator('.estimate-group'), '束は 2 つ').toHaveCount(2);
    const withLog = await scanContrast(poker.page, 10);
    expectReadable(withLog, 8, []);

    // When / Then その3（#348・#93）: 動きを抑える設定では、お題を隠したときの札の畳みに遅延が残らない。
    //   遅延（`visibility` の 0.32 秒）が残ると、その間 `visible` のまま高さだけ縮む。64rem 未満は `display: none` で
    //   遅延が効かず何も測れないので、広い幅にしてから押す（上で 1280 にした）。
    //   **フレームを数えて高さと `visibility` を読む形はやめた。** 移り変わりは書き換えの次のフレームで作られ、
    //   その次で始まる（start time が決まる）ので、並列で流すと 2 フレームでは終わっていない回があった。
    //   閉じた札の計算値の遅延を直に読み、終わった姿は待って確かめる
    await poker.page.getByRole('button', { name: 'お題を隠す' }).click();
    const side = poker.page.locator('.room-topic-side');
    await expect(side).toHaveAttribute('data-state', 'closed');
    const delays = await side.evaluate((el) => getComputedStyle(el).transitionDelay.split(',').map((d) => d.trim()));
    expect(delays.every((d) => d === '0s'), `動きを抑える設定で閉じた札の移り変わりの遅延が残っている（${delays.join(', ')}）`).toBe(true);
    //   閉じた札は幅 0 ではなく、高さ 0・hidden（脇の幅は変わらない）
    await expect.poll(() => side.evaluate((el) => el.getBoundingClientRect().height), '閉じた札が高さ 0 にならない').toBeLessThanOrEqual(1);
    await expect.poll(() => side.evaluate((el) => getComputedStyle(el).visibility), '閉じた札が隠れない').toBe('hidden');
    expect(await side.evaluate((el) => el.getBoundingClientRect().width), '閉じた札の幅が 0 になっている（幅ではなく高さで畳む）').toBeGreaterThan(100);
  });

  test('Given 2 人のルームで 1 人だけが投票 / When 票を公開する / Then 未投票の印も AA を満たし、動きを抑える設定ではめくりの遅延も止まる', async ({ page, openPeer }) => {
    // Given: 動きを抑える設定。2 人目が居るので、1 人が投票しても自動では公開されない。
    //   **投票するのは 2 人目（席順 1）で、作成者（席順 0）は未投票のまま。** 席順 0 は遅延が元から 0 なので、
    //   遅延を止めない誤りと区別できない（#348）
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const inviteUrl = await createRoom(page, 'a11y-creator');
    const voter = await openPeer('a11y-voter');
    await joinRoom(voter.page, inviteUrl, 'a11y-voter');
    await chooseCard(voter.page, '5');
    await expect(participantRow(page, 'a11y-voter').getByRole('img', { name: '投票済み' })).toBeVisible();

    // When: 作成者が票を公開する（めくりの記録は公開の前から始める）
    await recordSeatFlips(page);
    await page.getByRole('button', { name: '票を公開する' }).click();
    await expect(resultsSection(page)).toBeVisible();
    await expect(participantRow(page, 'a11y-creator').getByText('未投票', { exact: true })).toBeVisible();

    // Then その1: めくりは 1 本走り、席順 1 の終わりが 1ms 以内（遅延 90ms が止まっている）。
    //   0 本なら何も測っていない
    await expect.poll(() => seatFlips(page).then((f) => f.length), 'めくりの移り変わりが走っていない').toBe(1);
    const [flip] = await seatFlips(page);
    expect(flip!.order, '投票したのは席順 1').toBe(1);
    expect(flip!.end, '動きを抑える設定でめくりの遅延が残っている（ms）').toBeLessThanOrEqual(1);

    // Then その2: 未投票の印（`.no-vote`）を含めて、画面の字がすべて AA を満たす
    const scan = await scanContrast(page, 8);
    expectReadable(scan, 6, []);
    //   未投票の印（`--ivory-faint` on 席の沈んだ敷き `--felt-sink`）を測ったことも固定する。
    //   地の記述は羅紗の重なりまで続くので、先頭の組で照合する。印が走査の外の要素（`<div>` など）に
    //   変わると AA の判定は緑のまま、印を誰も測らなくなる（#320 PR 5 の最終レビュー）
    const [faint, sink] = await resolveColors(page, ['--ivory-faint', '--felt-sink']);
    const noVote = pairKey(faint!, sink!);
    expect([...scan.pairs].some((p) => p.startsWith(noVote)), `未投票の印（${noVote}）を測っていない`).toBe(true);
  });
});
