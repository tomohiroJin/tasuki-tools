#!/usr/bin/env bash
# Tasuki デプロイ共通ライブラリ
#
# アプリ固有の値は deploy/<app>/app.env にのみ書く。スクリプト側に値を散らさないのは、
# #51 で起きた「ユニットのユーザー名がスクリプトとテンプレートで食い違い、片方だけ直っていた」
# を構造的に防ぐため。値の定義場所は常に 1 つにする。

# ワークスペースのルート（このファイルの 2 つ上）
# deploy/lib/common.sh → deploy/ → <root>
WORKSPACE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
export WORKSPACE_ROOT

# app.env で必ず定義されていなければならないキー。
# 欠けたまま動かすと「空文字のパスへ rsync --delete」のような事故になるため、
# 使う直前ではなく読み込み時に落とす。
#
# 全アプリ共通で要るもの。
readonly REQUIRED_KEYS=(
	APP_NAME WEB_ROOT BUILD_FILTER WEB_DIST
)

# sync サーバーを持つアプリだけに要るもの。
# 静的サイト（STATIC_ONLY=1）は Caddy が直接配信するので、
# systemd ユニットもポートも env ファイルも持たない。
readonly SERVER_KEYS=(
	SERVICE PORT APP_DIR SYNC_ENTRY ENV_FILE
)

die() {
	echo "ERROR: $*" >&2
	exit 1
}

# 利用可能なアプリ名を列挙する（deploy/*/app.env があるディレクトリ）
available_apps() {
	local d
	for d in "$WORKSPACE_ROOT"/deploy/*/app.env; do
		[ -f "$d" ] || continue
		basename "$(dirname "$d")"
	done
}

# load_app <app>
#   deploy/<app>/app.env を読み込み、必須キーを検証してエクスポートする。
load_app() {
	local app="${1:-}"
	[ -n "$app" ] || die "アプリ名を指定してください。利用可能: $(available_apps | tr '\n' ' ')"

	# パス・トラバーサル防止。app はディレクトリ名として使うため英数と - のみ許す。
	printf '%s' "$app" | grep -Eq '^[a-z][a-z0-9-]{0,31}$' \
		|| die "アプリ名に使える文字は英小文字・数字・- のみです: $app"

	local env_file="$WORKSPACE_ROOT/deploy/$app/app.env"
	[ -f "$env_file" ] || die "$env_file が見つかりません。利用可能: $(available_apps | tr '\n' ' ')"

	# 実行時に決まるパスを読み込むのは意図した動作（アプリ名で切り替えるため）。
	set -a
	# shellcheck source=/dev/null
	source "$env_file"
	set +a

	local key
	for key in "${REQUIRED_KEYS[@]}"; do
		[ -n "${!key:-}" ] || die "$env_file に $key がありません（必須）"
	done

	[ "$APP_NAME" = "$app" ] \
		|| die "$env_file の APP_NAME（$APP_NAME）がディレクトリ名（$app）と一致しません"

	# 絶対パスであることを確認する（相対だとリモートで意図しない場所を触る）
	case "$WEB_ROOT" in
	/*) ;;
	*) die "WEB_ROOT は絶対パスで指定してください: $WEB_ROOT" ;;
	esac

	if [ -n "${STATIC_ONLY:-}" ]; then
		# 静的サイト。sync 用のキーが紛れていたら、どちらが本当か分からないので落とす。
		for key in "${SERVER_KEYS[@]}"; do
			[ -z "${!key:-}" ] \
				|| die "$env_file は STATIC_ONLY なのに $key を持っています（どちらかに決めてください）"
		done
		return
	fi

	for key in "${SERVER_KEYS[@]}"; do
		[ -n "${!key:-}" ] || die "$env_file に $key がありません（必須。静的サイトなら STATIC_ONLY=1 を指定）"
	done

	# SERVICE はリモートの sudo コマンド文字列に埋め込むため、シェルメタ文字を弾く
	# （環境変数経由のコマンドインジェクション防止）。
	printf '%s' "$SERVICE" | grep -Eq '^[A-Za-z0-9_.@-]+$' \
		|| die "SERVICE に使える文字は英数と _.@- のみです: $SERVICE"

	printf '%s' "$PORT" | grep -Eq '^[0-9]{2,5}$' \
		|| die "PORT が数値ではありません: $PORT"

	case "$APP_DIR" in
	/*) ;;
	*) die "APP_DIR は絶対パスで指定してください: $APP_DIR" ;;
	esac
}

# require_ssh_host
#   接続先を解決する。既定値は**置かない**。
#   #51 B: 既定が実在しない `myvps` だったため、README の手順がそのまま失敗していた。
#   未指定のまま接続を試みて分かりにくく落ちるより、設定方法を出して即座に止める。
require_ssh_host() {
	if [ -z "${TASUKI_SSH_HOST:-}" ]; then
		cat >&2 <<'MSG'
ERROR: 接続先が未設定です。

  TASUKI_SSH_HOST に ~/.ssh/config のホスト別名か user@host を指定してください。

    TASUKI_SSH_HOST=niku9 ./deploy/deploy.sh <app>

  ~/.ssh/config の例:

    Host niku9
      HostName <VPS の IP>
      User <ログインユーザー>
      IdentityFile ~/.ssh/<鍵>
      IdentitiesOnly yes

  実際のホスト名・IP は公開リポジトリに置かないため、既定値は用意していません。
MSG
		exit 1
	fi
	SSH_HOST="$TASUKI_SSH_HOST"
	export SSH_HOST
}

# run <コマンド...>
#   DRY_RUN=1 のときは実行せず表示だけする。デプロイ手順の確認に使う。
run() {
	if [ -n "${DRY_RUN:-}" ]; then
		printf '  [dry-run] %s\n' "$*"
	else
		"$@"
	fi
}
