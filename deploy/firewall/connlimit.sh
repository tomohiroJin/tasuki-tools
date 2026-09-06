#!/usr/bin/env bash
#
# 同一送信元 IP からの 443 同時接続数を制限する（#143・ADR 0011 脅威 S7）。
#
# ## これは何の対策か
#
# アプリ側の IP 単位レート制限（#103）とは**別軸**である。
#   - #103   : 入室・解錠の**失敗回数**をトークンバケツで絞る
#   - 本ルール: 同一 IP が**同時接続枠**（MAX_CONNECTIONS。本番では 200）を独占するのを防ぐ
# 同時接続上限はグローバルで IP 単位ではないため、単一 IP が枠を占有すると正規利用者を
# 締め出せる。それをネットワーク層で止める。
#
# ## 何を守らないか
#
# - **QUIC / HTTP/3（UDP 443）は数えない。** 本ルールは TCP の connlimit である。
#   WebSocket は TCP を通るので本 Issue の狙い（接続枠の独占）は防げるが、UDP 側は射程外。
# - **複数 IP へ分散する攻撃者は防げない**（#103 と同じ限界。ADR 0011 決定4）。
#
# ## 安全性
#
# **22/tcp には触らない。** SSH ロックアウトは起こらない。残るリスクは
# 「上限が低すぎて正規利用者を締め出す」ことだけなので、`--rollback-after` で
# 自動巻き戻しの安全網を掛けられる。
#
# 使い方:
#   sudo bash connlimit.sh status
#   sudo bash connlimit.sh apply --rollback-after 10min
#   sudo bash connlimit.sh confirm     # 自動巻き戻しを取り消して確定する
#   sudo bash connlimit.sh rollback    # 手で元に戻す
set -euo pipefail

# 同一 IP に許す 443 の同時接続数。**この値が実際に効く正本である。**
# 決定と根拠（同一拠点 40 人 × 約 2 接続に 2 倍の余裕／グローバル 200 の 40%）は
# deploy/README.md の「同一 IP の同時接続数制限（#143）」に記録してある。
# 値を変えるときは両方を直すこと。
CONNLIMIT_MAX="${CONNLIMIT_MAX:-80}"

BEGIN_MARK="### BEGIN tasuki connlimit (#143) ###"
END_MARK="### END tasuki connlimit (#143) ###"
V4_RULES=/etc/ufw/before.rules
V6_RULES=/etc/ufw/before6.rules
ROLLBACK_UNIT=tasuki-connlimit-rollback

die() {
	echo "エラー: $*" >&2
	exit 1
}

require_root() {
	[ "$(id -u)" -eq 0 ] || die "root で実行してください（sudo bash $0 ...）"
}

# **触る前に、使う道具が揃っているかを確かめる。**
# connlimit モジュールが無いまま before.rules へ書いて ufw reload すると、
# ルール投入に失敗してファイアウォールが不定な状態になりうる。
# ファイルを 1 バイトも書き換える前に落とす。
preflight() {
	command -v ufw >/dev/null || die "ufw が見つかりません"
	command -v iptables >/dev/null || die "iptables が見つかりません"
	# 組み込みなら modprobe は失敗するので結果は見ない（best effort）。
	modprobe xt_connlimit 2>/dev/null || true
	iptables -m connlimit --help >/dev/null 2>&1 ||
		die "iptables の connlimit が使えません（xt_connlimit が無い）。適用を中止します"
	ip6tables -m connlimit --help >/dev/null 2>&1 ||
		die "ip6tables の connlimit が使えません。適用を中止します"
	[ -f "$V4_RULES" ] || die "$V4_RULES がありません"
	[ -f "$V6_RULES" ] || die "$V6_RULES がありません"
	# **ufw が無効なら触らない。** 無効だと `ufw reload` は
	# "Firewall not enabled (skipping reload)" と言って**何もせず成功を返す**。
	# その状態で先へ進むと、古いルールが残っているだけなのに
	# 「適用できた」と誤判定する（実際に踏んだ）。
	ufw status 2>/dev/null | head -1 | grep -q "Status: active" ||
		die "ufw が無効です。先に 'ufw enable' で有効にしてください（無効のまま適用すると reload が黙って飛ばされます）"
	echo "事前確認: ufw / iptables / ip6tables / connlimit すべて利用できます"
}

# 挿入する断片。
# $1 = チェーン名。**IPv4 は ufw-before-input、IPv6 は ufw6-before-input で別物である。**
#      同じ名前を両方に書くと ip6tables-restore が
#      "No chain/target/match by that name" で落ち、ufw が起動できなくなる（実際に踏んだ）。
# $2 = connlimit-mask（IPv4 は 32、IPv6 は #103 決定 D1 に合わせて 64）
rule_block() {
	local chain="$1" mask="$2"
	printf '%s\n' "$BEGIN_MARK"
	printf '%s\n' "# 同一送信元 IP からの 443 同時接続を ${CONNLIMIT_MAX} 本までに制限する（#143）。"
	printf '%s\n' "# --syn で新規接続だけを数える。REJECT は正規利用者が即座に失敗を知れるようにするため"
	printf '%s\n' "# （DROP だとブラウザが待たされ、原因の切り分けが難しくなる）。"
	printf '%s\n' "-A ${chain} -p tcp --syn --dport 443 -m connlimit --connlimit-above ${CONNLIMIT_MAX} --connlimit-mask ${mask} -j REJECT --reject-with tcp-reset"
	printf '%s\n' "$END_MARK"
}

has_block() { grep -qF "$BEGIN_MARK" "$1" 2>/dev/null; }

# *filter テーブルを閉じる最初の COMMIT の直前へ差し込む。
# **アンカーが無ければ何もせず落ちる。** 位置を推測して壊すより、気づける形で止める。
insert_block() {
	local file="$1" chain="$2" mask="$3" tmp
	grep -qE '^\*filter' "$file" || die "$file に *filter が見つかりません（想定外の構成）"
	grep -qE '^COMMIT$' "$file" || die "$file に COMMIT が見つかりません（想定外の構成）"
	# **書く前に、そのチェーンが本当にこのファイルで定義されているかを見る。**
	# 名前を取り違えたまま書くと ufw が起動できなくなる。
	grep -qE "^:${chain} " "$file" || die "$file に :${chain} の定義がありません（チェーン名の取り違え）"
	tmp="$(mktemp)"
	awk -v block="$(rule_block "$chain" "$mask")" '
		!done && /^COMMIT$/ { print block; done = 1 }
		{ print }
	' "$file" >"$tmp"
	cat "$tmp" >"$file"
	rm -f "$tmp"
}

remove_block() {
	local file="$1" tmp
	has_block "$file" || return 0
	tmp="$(mktemp)"
	sed "/$(printf '%s' "$BEGIN_MARK" | sed 's/[][\.*^$/#]/\\&/g')/,/$(printf '%s' "$END_MARK" | sed 's/[][\.*^$/#]/\\&/g')/d" "$file" >"$tmp"
	cat "$tmp" >"$file"
	rm -f "$tmp"
}

BACKUP_V4=""
BACKUP_V6=""

backup() {
	local stamp
	stamp="$(date +%Y%m%d-%H%M%S)"
	BACKUP_V4="${V4_RULES}.bak-${stamp}"
	BACKUP_V6="${V6_RULES}.bak-${stamp}"
	cp -p "$V4_RULES" "$BACKUP_V4"
	cp -p "$V6_RULES" "$BACKUP_V6"
	echo "退避: $BACKUP_V4 / $BACKUP_V6"
}

# この実行で取った退避へ戻す。マーカー削除ではなくファイルごと戻すので、
# 挿入が中途半端でも確実に元へ戻る。
restore_backup() {
	[ -n "$BACKUP_V4" ] && [ -f "$BACKUP_V4" ] && cat "$BACKUP_V4" >"$V4_RULES"
	[ -n "$BACKUP_V6" ] && [ -f "$BACKUP_V6" ] && cat "$BACKUP_V6" >"$V6_RULES"
	echo "退避から戻しました。"
}

# ufw reload 後に、ルールが本当に効いているかを見る。
# **入れたつもりで入っていない**のがいちばん危ないので、必ず実物を確認する。
verify_active() {
	local n4 n6
	n4="$(iptables -S ufw-before-input 2>/dev/null | grep -c 'connlimit' || true)"
	n6="$(ip6tables -S ufw6-before-input 2>/dev/null | grep -c 'connlimit' || true)"
	# **v4 だけ見て緑にしない。** v6 の取り違えはまさにそこをすり抜けた。
	[ "$n4" -ge 1 ] || die "iptables の ufw-before-input に connlimit が現れません"
	[ "$n6" -ge 1 ] || die "ip6tables の ufw6-before-input に connlimit が現れません"
	echo "確認: IPv4 ${n4} 件 / IPv6 ${n6} 件"
	iptables -S ufw-before-input | grep 'connlimit'
	ip6tables -S ufw6-before-input | grep 'connlimit'
}

cmd_status() {
	echo "--- before.rules への追記 ---"
	if has_block "$V4_RULES"; then echo "IPv4: あり"; else echo "IPv4: なし"; fi
	if has_block "$V6_RULES"; then echo "IPv6: あり"; else echo "IPv6: なし"; fi
	echo "--- 実際に効いているルール ---"
	iptables -S ufw-before-input 2>/dev/null | grep 'connlimit' || echo "(iptables に connlimit なし)"
	echo "--- 自動巻き戻しの予約 ---"
	systemctl list-timers "${ROLLBACK_UNIT}.timer" --all --no-pager 2>/dev/null | head -3 || true
}

cmd_apply() {
	local after="${1:-}"
	if has_block "$V4_RULES" && has_block "$V6_RULES"; then
		echo "既に適用済みです（何もしません）。値を変えるなら rollback してから apply してください。"
		return 0
	fi
	preflight
	backup
	has_block "$V4_RULES" || insert_block "$V4_RULES" ufw-before-input 32
	# IPv6 は #103 D1 に合わせて /64 で丸める。
	# 本番には現在グローバル IPv6 が無いので今日は不活性だが、
	# 後で IPv6 を有効にしたときに静かに穴が開かないよう先に入れる。
	has_block "$V6_RULES" || insert_block "$V6_RULES" ufw6-before-input 64
	# **reload に失敗したら、壊れたファイルを残さずその場で戻す。**
	# 残すと次回の起動・reload でも ufw が失敗し続ける（実際に踏んだ）。
	if ! ufw reload; then
		echo "ufw reload に失敗しました。退避から戻します。" >&2
		restore_backup
		ufw reload || echo "戻したあとの reload も失敗しました。手で確認してください。" >&2
		die "適用を中止し、元の状態へ戻しました"
	fi
	verify_active
	if [ -n "$after" ]; then
		systemd-run --on-active="$after" --unit="$ROLLBACK_UNIT" \
			/bin/bash "$(readlink -f "$0")" rollback >/dev/null
		echo "安全網: ${after} 後に自動で巻き戻します。問題なければ 'sudo bash $0 confirm' で確定してください。"
	fi
}

cmd_confirm() {
	# **予約が無いのに「取り消しました」と言わない。** 安全網が張られていないのに
	# 張られていたかのように読めると、失敗に気づけない（実際に踏んだ）。
	if systemctl list-units --all --no-legend "${ROLLBACK_UNIT}.timer" 2>/dev/null | grep -q .; then
		systemctl stop "${ROLLBACK_UNIT}.timer" 2>/dev/null || true
		systemctl reset-failed "${ROLLBACK_UNIT}.service" 2>/dev/null || true
		echo "自動巻き戻しの予約を取り消しました。設定を確定します。"
	else
		echo "自動巻き戻しの予約はありません（取り消すものがありませんでした）。"
	fi
	echo "--- 現在の状態 ---"
	cmd_status
}

cmd_rollback() {
	remove_block "$V4_RULES"
	remove_block "$V6_RULES"
	ufw reload
	if iptables -S ufw-before-input 2>/dev/null | grep -q 'connlimit' ||
		ip6tables -S ufw6-before-input 2>/dev/null | grep -q 'connlimit'; then
		die "巻き戻したのに connlimit が残っています（ufw が無効で reload が飛ばされた可能性があります）"
	fi
	echo "巻き戻しました（connlimit なし）。"
}

main() {
	require_root
	case "${1:-}" in
	status) cmd_status ;;
	apply)
		shift
		local after=""
		[ "${1:-}" = "--rollback-after" ] && after="${2:-}"
		cmd_apply "$after"
		;;
	confirm) cmd_confirm ;;
	rollback) cmd_rollback ;;
	*) die "使い方: $0 {status|apply [--rollback-after 10min]|confirm|rollback}" ;;
	esac
}

main "$@"
