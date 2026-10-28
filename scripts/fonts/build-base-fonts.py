#!/usr/bin/env python3
"""書体の base 層（zkgn-{400,500,700}-base.woff2）を作り直す。運用者が手で流す（CI では流さない）。

字の集合 = いまの base 層の cmap ∪ --add-chars の字。いまの字は 1 字も落とさない。
元の書体は Google Fonts の Zen Kaku Gothic New（OFL）。既定は下の REV のコミット。

使い方（リポジトリの根から）:
    pip install fonttools brotli
    python3 scripts/fonts/build-base-fonts.py --add-chars '足したい字や文言' --cache-dir <作業用ディレクトリ>

- 元の書体（ttf）は --cache-dir に無ければ GitHub から取る。リポジトリには入れない
- `fonts.css` の base 3 面の unicode-range は、新しい cmap から生成する（手で書かない）
- ext 層（zkgn-*-ext.woff2）は作り直さない
- 最後に「古い cmap ⊆ 新しい cmap」を確かめ、崩れていたら失敗で終わる（fail-closed）
- 画面の文言が base 層に収まるかは `tests/support/font-base.ts` の `outsideBase` で先に測る
"""
import argparse
import re
import sys
import urllib.request
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

# 元の書体を取得したコミット（github.com/google/fonts・ofl/zenkakugothicnew。2026-10-28 に確認）
REV = "ba225958c40ae6268a256861d80355a84b26e535"
WEIGHTS = {400: "Regular", 500: "Medium", 700: "Bold"}
RAW = "https://raw.githubusercontent.com/google/fonts/{rev}/ofl/zenkakugothicnew/ZenKakuGothicNew-{name}.ttf"


def cmap_of(path: Path) -> set[int]:
    return set(TTFont(str(path)).getBestCmap())


def to_ranges(codes: set[int]) -> str:
    """cmap を `U+0020-007E,U+00A2-00A3,…` に畳む（`fonts.css` の unicode-range）。"""
    out, run = [], []
    for c in sorted(codes):
        if run and c == run[-1] + 1:
            run.append(c)
            continue
        if run:
            out.append(run)
        run = [c]
    if run:
        out.append(run)
    return ",".join(
        f"U+{r[0]:04X}" if len(r) == 1 else f"U+{r[0]:04X}-{r[-1]:04X}" for r in out
    )


def fetch(rev: str, name: str, dest: Path) -> Path:
    if not dest.exists():
        with urllib.request.urlopen(RAW.format(rev=rev, name=name)) as res:
            dest.write_bytes(res.read())
    return dest


def build(src: Path, codes: set[int], dest: Path) -> None:
    """`pyftsubset` の既定に揃える: woff2・layout_features='*'・ヒント無し。"""
    opts = subset.Options()
    opts.flavor = "woff2"
    opts.layout_features = ["*"]
    opts.hinting = False
    font = subset.load_font(str(src), opts)
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=sorted(codes))
    sub.subset(font)
    subset.save_font(font, str(dest), opts)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--add-chars", required=True, help="足す字（文言をそのまま渡してよい。空白は無視）")
    ap.add_argument("--rev", default=REV, help="google/fonts のコミット（既定: %(default)s）")
    ap.add_argument("--cache-dir", type=Path, required=True, help="元の書体（ttf）の置き場。リポジトリの外か gitignore の中")
    ap.add_argument("--fonts-dir", type=Path, default=Path("packages/ui/src/fonts"))
    ap.add_argument("--css", type=Path, default=Path("packages/ui/src/tokens/fonts.css"))
    args = ap.parse_args()

    args.cache_dir.mkdir(parents=True, exist_ok=True)
    add = {ord(c) for c in args.add_chars if not c.isspace()}
    report = []
    ranges: dict[int, str] = {}
    for weight, name in WEIGHTS.items():
        target = args.fonts_dir / f"zkgn-{weight}-base.woff2"
        old_codes, old_size = cmap_of(target), target.stat().st_size
        src = fetch(args.rev, name, args.cache_dir / f"ZenKakuGothicNew-{name}.ttf")
        have = set(TTFont(str(src)).getBestCmap())
        missing = sorted(c for c in add if c not in have)
        if missing:
            print(f"元の書体に無い字: {''.join(map(chr, missing))}", file=sys.stderr)
            return 1
        want = old_codes | add
        tmp = args.cache_dir / target.name
        build(src, want, tmp)
        new_codes = cmap_of(tmp)
        lost = old_codes - new_codes
        if lost:  # fail-closed: 1 字でも落ちたら何も置き換えない
            print(f"{weight}: 落ちた字がある: {''.join(map(chr, sorted(lost)))}", file=sys.stderr)
            return 1
        if not add <= new_codes:
            print(f"{weight}: 足したはずの字が無い", file=sys.stderr)
            return 1
        tmp.replace(target)
        ranges[weight] = to_ranges(new_codes)
        report.append((weight, len(old_codes), len(new_codes), old_size, target.stat().st_size))

    css = args.css.read_text(encoding="utf8")
    css = re.sub(r"^/\* 自動生成: [^*]*\*/", "/* 自動生成: scripts/fonts/build-base-fonts.py（base 層の unicode-range）。手で編集しないこと。 */", css, count=1)
    for weight, rng in ranges.items():
        pat = re.compile(r"(url\('\.\./fonts/zkgn-%d-base\.woff2'\) format\('woff2'\);\n\s*unicode-range: )[^;]+;" % weight)
        css, n = pat.subn(lambda m: m.group(1) + rng + ";", css)
        if n != 1:
            print(f"{weight}: fonts.css の base 面が見つからない", file=sys.stderr)
            return 1
    args.css.write_text(css, encoding="utf8")

    print("太さ  字数(前→後)  大きさ(前→後, 増分)")
    total = 0
    for w, a, b, s0, s1 in report:
        total += s1 - s0
        print(f"{w}  {a}→{b}  {s0}→{s1}  {s1 - s0:+d}")
    print(f"合計の増分: {total} bytes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
