/**
 * 定型バンクのうち、設計・モデリングのお題（#634）。
 *
 * コードを書く前に、型や責務を話し合うお題。本文は Markdown で、「話し合うこと:」の箇条書きを持つ。
 * コードは必須ではない（載せるときはコードの囲み（```）で包む）。
 */
import type { TopicBankEntry } from "./topic-bank.js";

export const DESIGN_TOPICS: readonly TopicBankEntry[] = [
  {
    "title": "図書館の貸出モデル",
    "body": "## 背景\n\n小さな図書館の貸出を管理する仕組みを作ります。コードを書く前に、「本」「蔵書（1 冊ずつの実物）」「会員」「貸出」をどう分けて表すかを話し合うお題です。\n\n同じタイトルの本が 3 冊あれば、貸し出せるのは実物の 1 冊ずつです。「本の情報」と「棚にある 1 冊」を同じ型にしてしまうと、どこかで無理が出ます。\n\n## ルール\n\n- 会員は同時に 5 冊まで借りられる\n- 貸出期間は 14 日。返却日を過ぎた貸出は「延滞」\n- 延滞中の会員は新しく借りられない\n- 1 冊の蔵書は同時に 1 人にしか貸し出せない\n\n## 考慮すること\n\n- 「貸出中かどうか」を蔵書の側に持つか、貸出の記録から求めるか\n- 返却したら貸出の記録を消すのか、「返却済み」として残すのか\n- 「延滞」は保存する状態か、今日の日付から毎回求める性質か\n\n話し合うこと:\n- 本（書誌情報）と蔵書（1 冊の実物）を分けるか。分けるなら何が分かれ目か\n- 「5 冊まで」の規則はどの型が守るか（会員・貸出・それ以外）\n- 延滞を状態として持つと何が困り、求めると何が困るか\n- 貸出の記録に要る項目は何か（いつ・誰が・どれを・いつまで）\n\n満たすこと:\n- 本・蔵書・会員・貸出の型の定義を書く（項目と型だけでよい）\n- 「借りる」操作が守る規則を箇条書きで 3 つ以上挙げる\n- 延滞の判定を、今日の日付を受け取る関数の形（シグネチャ）で書く\n\n型のたたき台:\n```\n{{slot:typeSketch}}\n```\n\nヒント:\n- 「同じタイトルの 2 冊目」を思い浮かべると、型を分ける理由が見える\n- 今日の日付は引数で受け取ると、延滞の判定がテストしやすい",
    "difficulty": "easy",
    "category": "design",
    "slots": {
      "typeSketch": {
        "TypeScript": "type Book = { isbn: string; title: string };\ntype Copy = { copyId: string; isbn: string };\ntype Loan = { copyId: string; memberId: string; borrowedOn: Date; dueOn: Date; returnedOn?: Date };",
        "JavaScript": "/** @typedef {{ isbn: string, title: string }} Book */\n/** @typedef {{ copyId: string, isbn: string }} Copy */\n/** @typedef {{ copyId: string, memberId: string, borrowedOn: Date, dueOn: Date, returnedOn?: Date }} Loan */",
        "Python": "from dataclasses import dataclass\nfrom datetime import date\n\n\n@dataclass(frozen=True)\nclass Book:\n    isbn: str\n    title: str\n\n\n@dataclass(frozen=True)\nclass Copy:\n    copy_id: str\n    isbn: str\n\n\n@dataclass\nclass Loan:\n    copy_id: str\n    member_id: str\n    borrowed_on: date\n    due_on: date\n    returned_on: date | None = None",
        "Java": "import java.time.LocalDate;\nimport java.util.Optional;\n\nrecord Book(String isbn, String title) {}\nrecord Copy(String copyId, String isbn) {}\nrecord Loan(String copyId, String memberId, LocalDate borrowedOn, LocalDate dueOn, Optional<LocalDate> returnedOn) {}",
        "Go": "import \"time\"\n\ntype Book struct {\n\tISBN  string\n\tTitle string\n}\n\ntype Copy struct {\n\tCopyID string\n\tISBN   string\n}\n\ntype Loan struct {\n\tCopyID     string\n\tMemberID   string\n\tBorrowedOn time.Time\n\tDueOn      time.Time\n\tReturnedOn *time.Time // nil なら返却前\n}",
        "Ruby": "Book = Data.define(:isbn, :title)\nCopy = Data.define(:copy_id, :isbn)\nLoan = Data.define(:copy_id, :member_id, :borrowed_on, :due_on, :returned_on) # returned_on は返却前なら nil",
        "Rust": "use chrono::NaiveDate;\n\npub struct Book { pub isbn: String, pub title: String }\npub struct Copy { pub copy_id: String, pub isbn: String }\npub struct Loan {\n    pub copy_id: String,\n    pub member_id: String,\n    pub borrowed_on: NaiveDate,\n    pub due_on: NaiveDate,\n    pub returned_on: Option<NaiveDate>,\n}",
        "C#": "public record Book(string Isbn, string Title);\npublic record Copy(string CopyId, string Isbn);\npublic record Loan(string CopyId, string MemberId, DateOnly BorrowedOn, DateOnly DueOn, DateOnly? ReturnedOn = null);",
        "Kotlin": "import java.time.LocalDate\n\ndata class Book(val isbn: String, val title: String)\ndata class Copy(val copyId: String, val isbn: String)\ndata class Loan(\n    val copyId: String,\n    val memberId: String,\n    val borrowedOn: LocalDate,\n    val dueOn: LocalDate,\n    val returnedOn: LocalDate? = null,\n)",
        "Swift": "import Foundation\n\nstruct Book { let isbn: String; let title: String }\nstruct Copy { let copyId: String; let isbn: String }\nstruct Loan {\n    let copyId: String\n    let memberId: String\n    let borrowedOn: Date\n    let dueOn: Date\n    var returnedOn: Date?\n}"
      }
    }
  },
  {
    "title": "会議室予約の時間枠",
    "body": "## 背景\n\n社内の会議室を予約する仕組みを作ります。予約の中心は「いつからいつまで」という時間の枠です。開始と終了を別々の数値で持ち回ると、終了が開始より前の予約や、重なりの判定の書き間違いが紛れ込みます。\n\nこのお題では、時間の枠を 1 つの値（値オブジェクト）として表すことを話し合います。\n\n## ルール\n\n- 予約は 15 分単位。開始と終了は 15 分の区切りに揃う\n- 終了は開始より後（長さ 0 の予約は無い）\n- 同じ部屋で時間が重なる予約は取れない\n- 10:00〜11:00 と 11:00〜12:00 は重ならない（端が接するだけ）\n\n## 考慮すること\n\n- 終了の時刻を含むか含まないか（半開区間にするか）\n- 不正な枠（終了が先・15 分に揃わない）を作れないようにするには、どこで確かめるか\n- 時刻のタイムゾーンを枠に持たせるか、部屋の側で決めるか\n\n話し合うこと:\n- 時間の枠を表す型に、どんな操作を持たせるか（重なる・含む・長さ）\n- 不正な値を作らせない方法（生成の関数で確かめる・型を分ける）\n- 「重なり」の判定は枠の責務か、予約の一覧（部屋）の責務か\n- 端が接する場合を重なりに数えない理由と、それを型でどう表すか\n\n満たすこと:\n- 時間の枠の型と、それを作る関数のシグネチャを書く\n- 重なりの判定の振る舞いを、例 3 つ（重なる・接する・離れている）で示す\n- 予約が守る規則と、その規則を守る場所を対にして書く\n\n型のたたき台:\n```\n{{slot:typeSketch}}\n```\n\nヒント:\n- 半開区間 [start, end) にすると、接する枠の扱いが素直になる",
    "difficulty": "easy",
    "category": "design",
    "slots": {
      "typeSketch": {
        "TypeScript": "type TimeSlot = { start: Date; end: Date }; // end は含まない\ndeclare function createSlot(start: Date, end: Date): TimeSlot | Error;\ndeclare function overlaps(a: TimeSlot, b: TimeSlot): boolean;",
        "JavaScript": "/** @typedef {{ start: Date, end: Date }} TimeSlot end は含まない */\n\n/**\n * @param {Date} start\n * @param {Date} end\n * @returns {TimeSlot | Error}\n */\nfunction createSlot(start, end) {}\n\n/**\n * @param {TimeSlot} a\n * @param {TimeSlot} b\n * @returns {boolean}\n */\nfunction overlaps(a, b) {}",
        "Python": "from dataclasses import dataclass\nfrom datetime import datetime\n\n\n@dataclass(frozen=True)\nclass TimeSlot:\n    start: datetime\n    end: datetime  # end は含まない\n\n\ndef create_slot(start: datetime, end: datetime) -> TimeSlot: ...  # 不正なら ValueError を raise\ndef overlaps(a: TimeSlot, b: TimeSlot) -> bool: ...",
        "Java": "import java.time.Instant;\nimport java.util.Optional;\n\nrecord TimeSlot(Instant start, Instant end) {} // end は含まない\n\ninterface TimeSlots {\n    Optional<TimeSlot> create(Instant start, Instant end); // 不正なら empty\n    boolean overlaps(TimeSlot a, TimeSlot b);\n}",
        "Go": "import \"time\"\n\ntype TimeSlot struct {\n\tstart time.Time\n\tend   time.Time // end は含まない\n}\n\nfunc NewTimeSlot(start, end time.Time) (TimeSlot, error)\nfunc (s TimeSlot) Overlaps(other TimeSlot) bool",
        "Ruby": "TimeSlot = Data.define(:start_at, :end_at) do # end_at は含まない\n  # => TimeSlot。不正なら ArgumentError を raise する\n  def self.create(start_at, end_at); end\n\n  def overlaps?(other); end\nend",
        "Rust": "use chrono::{DateTime, Utc};\n\npub struct TimeSlot { start: DateTime<Utc>, end: DateTime<Utc> } // end は含まない\n\npub enum SlotError { EndNotAfterStart, NotAligned }\n\nimpl TimeSlot {\n    pub fn new(start: DateTime<Utc>, end: DateTime<Utc>) -> Result<Self, SlotError> { todo!() }\n    pub fn overlaps(&self, other: &TimeSlot) -> bool { todo!() }\n}",
        "C#": "public readonly record struct TimeSlot(DateTimeOffset Start, DateTimeOffset End); // End は含まない\n\npublic interface ITimeSlots\n{\n    TimeSlot? Create(DateTimeOffset start, DateTimeOffset end); // 不正なら null\n    bool Overlaps(TimeSlot a, TimeSlot b);\n}",
        "Kotlin": "import java.time.Instant\n\ndata class TimeSlot(val start: Instant, val end: Instant) // end は含まない\n\nfun createSlot(start: Instant, end: Instant): Result<TimeSlot> = TODO()\nfun TimeSlot.overlaps(other: TimeSlot): Boolean = TODO()",
        "Swift": "import Foundation\n\nstruct TimeSlot { let start: Date; let end: Date } // end は含まない\n\nenum SlotError: Error { case endNotAfterStart, notAligned }\n\nprotocol TimeSlots {\n    func makeSlot(start: Date, end: Date) -> Result<TimeSlot, SlotError>\n    func overlaps(_ a: TimeSlot, _ b: TimeSlot) -> Bool\n}"
      }
    }
  },
  {
    "title": "自動販売機の状態遷移",
    "body": "## 背景\n\n飲み物の自動販売機を、状態遷移として設計するお題です。ボタンを押したとき・お金を入れたときに何が起きるかは、いまの状態で変わります。if 文を書き始める前に、状態と出来事の表を作って全体を見渡します。\n\n## 振る舞い\n\n- 待機中にお金を入れると「投入中」になる\n- 投入額が価格以上で商品のボタンを押すと、商品とおつりを出して待機中に戻る\n- 投入額が足りないときにボタンを押しても何も出ない\n- 返却レバーを引くと、投入額を全額返して待機中に戻る\n- 売り切れの商品のボタンは反応しない\n\n## 考慮すること\n\n- 「投入中」の状態は投入額を持つ。待機中は持たない\n- 売り切れは機械全体の状態か、商品ごとの状態か\n- おつりが出せない（硬貨が足りない）場合をどこまで扱うか\n\n話し合うこと:\n- 状態の一覧と、各状態で受け付ける出来事は何か\n- 状態ごとに持つデータが違うとき、型をどう分けるか（判別できる共用体など）\n- 不正な遷移（待機中に「商品を出す」）を起こせない形にできるか\n- 売り切れ・おつり切れを状態に入れるか、別の判定にするか\n\n満たすこと:\n- 状態 × 出来事の表を書く（空欄は「受け付けない」と明記する）\n- 状態の型の定義を書く\n- 遷移の関数のシグネチャを 1 つ書く（いまの状態と出来事を受け取り、次の状態と出力を返す）\n\n型のたたき台:\n```\n{{slot:typeSketch}}\n```\n\nヒント:\n- 表を先に書くと、扱い忘れの組み合わせが空欄として目に見える",
    "difficulty": "easy",
    "category": "design",
    "slots": {
      "typeSketch": {
        "TypeScript": "type State = { kind: 'idle' } | { kind: 'inserting'; amount: number };\ntype Event = { kind: 'insert'; coin: number } | { kind: 'select'; itemId: string } | { kind: 'refund' };\ndeclare function next(state: State, event: Event): { state: State; output: string[] };",
        "JavaScript": "/** @typedef {{ kind: 'idle' } | { kind: 'inserting', amount: number }} State */\n/** @typedef {{ kind: 'insert', coin: number } | { kind: 'select', itemId: string } | { kind: 'refund' }} Event */\n\n/**\n * @param {State} state\n * @param {Event} event\n * @returns {{ state: State, output: string[] }}\n */\nfunction next(state, event) {}",
        "Python": "from dataclasses import dataclass\n\n\n@dataclass(frozen=True)\nclass Idle:\n    pass\n\n\n@dataclass(frozen=True)\nclass Inserting:\n    amount: int\n\n\nState = Idle | Inserting\n\n\n@dataclass(frozen=True)\nclass Insert:\n    coin: int\n\n\n@dataclass(frozen=True)\nclass Select:\n    item_id: str\n\n\n@dataclass(frozen=True)\nclass Refund:\n    pass\n\n\nEvent = Insert | Select | Refund\n\n\ndef next_state(state: State, event: Event) -> tuple[State, list[str]]: ...",
        "Java": "import java.util.List;\n\nsealed interface State permits Idle, Inserting {}\nrecord Idle() implements State {}\nrecord Inserting(int amount) implements State {}\n\nsealed interface Event permits Insert, Select, Refund {}\nrecord Insert(int coin) implements Event {}\nrecord Select(String itemId) implements Event {}\nrecord Refund() implements Event {}\n\nrecord Transition(State state, List<String> output) {}\n\ninterface VendingMachine {\n    Transition next(State state, Event event);\n}",
        "Go": "type State interface{ isState() }\n\ntype Idle struct{}\ntype Inserting struct{ Amount int }\n\nfunc (Idle) isState()      {}\nfunc (Inserting) isState() {}\n\ntype Event interface{ isEvent() }\n\ntype Insert struct{ Coin int }\ntype Select struct{ ItemID string }\ntype Refund struct{}\n\nfunc (Insert) isEvent() {}\nfunc (Select) isEvent() {}\nfunc (Refund) isEvent() {}\n\nfunc Next(state State, event Event) (State, []string)",
        "Ruby": "Idle = Data.define\nInserting = Data.define(:amount)\n\nInsert = Data.define(:coin)\nSelect = Data.define(:item_id)\nRefund = Data.define\n\n# => [次の状態, 出力の配列]\ndef next_state(state, event); end",
        "Rust": "pub enum State {\n    Idle,\n    Inserting { amount: u32 },\n}\n\npub enum Event {\n    Insert { coin: u32 },\n    Select { item_id: String },\n    Refund,\n}\n\npub fn next(state: State, event: Event) -> (State, Vec<String>) { todo!() }",
        "C#": "public abstract record State\n{\n    public sealed record Idle() : State;\n    public sealed record Inserting(int Amount) : State;\n}\n\npublic abstract record Event\n{\n    public sealed record Insert(int Coin) : Event;\n    public sealed record Select(string ItemId) : Event;\n    public sealed record Refund() : Event;\n}\n\npublic interface IVendingMachine\n{\n    (State State, IReadOnlyList<string> Output) Next(State state, Event @event);\n}",
        "Kotlin": "sealed interface State {\n    data object Idle : State\n    data class Inserting(val amount: Int) : State\n}\n\nsealed interface Event {\n    data class Insert(val coin: Int) : Event\n    data class Select(val itemId: String) : Event\n    data object Refund : Event\n}\n\nfun next(state: State, event: Event): Pair<State, List<String>> = TODO()",
        "Swift": "enum State {\n    case idle\n    case inserting(amount: Int)\n}\n\nenum Event {\n    case insert(coin: Int)\n    case select(itemId: String)\n    case refund\n}\n\nprotocol VendingMachine {\n    func next(_ state: State, _ event: Event) -> (state: State, output: [String])\n}"
      }
    }
  },
  {
    "title": "ポイント残高の値オブジェクト",
    "body": "## 背景\n\nお店のポイントカードを作ります。ポイントを {{slot:numType}} のまま持ち回ると、金額と足してしまう・負のポイントができる・小数のポイントができる、といった誤りが型で止まりません。\n\nこのお題では、ポイントを値オブジェクトとして表すことを話し合います。\n\n## ルール\n\n- ポイントは 0 以上の整数\n- 購入 100 円ごとに 1 ポイント貯まる（端数は切り捨て）\n- 1 ポイント = 1 円として支払いに使える\n- 残高を超えて使うことはできない\n\n## 考慮すること\n\n- 「ポイント」と「円」を別の型にするか\n- 残高を超えて使おうとしたら、例外にするか・結果の値で返すか\n- 加算・減算の結果も必ず 0 以上の整数になるか\n\n話し合うこと:\n- ポイントの型に持たせる操作（足す・引く・比べる・円に直す）は何か\n- 不正な値（負・小数）を作れないようにする方法\n- 「円からポイントを求める」計算は、どの型の責務か\n- 値オブジェクトを変更可能にしない理由\n\n満たすこと:\n- ポイントの型と、それを作る関数のシグネチャを書く\n- 残高不足のときの返し方を決め、理由を 1 文で書く\n- 円とポイントを取り違えると型で止まる例を 1 つ示す\n\n型のたたき台:\n```\n{{slot:typeSketch}}\n```\n\nヒント:\n- 足し算や引き算も新しい値を返す形にすると、不変条件を 1 か所で守れる",
    "difficulty": "easy",
    "category": "design",
    "slots": {
      "typeSketch": {
        "TypeScript": "type Points = { readonly value: number };\ndeclare function points(value: number): Points | Error;\ndeclare function earn(yen: number): Points;\ndeclare function spend(balance: Points, use: Points): Points | Error;",
        "JavaScript": "/** @typedef {Readonly<{ value: number }>} Points */\n\n/**\n * @param {number} value\n * @returns {Points | Error}\n */\nfunction points(value) {}\n\n/**\n * @param {number} yen\n * @returns {Points}\n */\nfunction earn(yen) {}\n\n/**\n * @param {Points} balance\n * @param {Points} use\n * @returns {Points | Error}\n */\nfunction spend(balance, use) {}",
        "Python": "from dataclasses import dataclass\n\n\n@dataclass(frozen=True)\nclass Points:\n    value: int\n\n\ndef points(value: int) -> Points: ...  # 不正なら ValueError を raise\ndef earn(yen: int) -> Points: ...\ndef spend(balance: Points, use: Points) -> Points: ...  # 残高不足なら ValueError を raise",
        "Java": "import java.util.Optional;\n\nrecord Points(int value) {}\n\ninterface PointRules {\n    Optional<Points> points(int value); // 不正なら empty\n    Points earn(int yen);\n    Optional<Points> spend(Points balance, Points use); // 残高不足なら empty\n}",
        "Go": "type Points struct{ value int }\n\nfunc NewPoints(value int) (Points, error)\nfunc Earn(yen int) Points\nfunc Spend(balance, use Points) (Points, error)",
        "Ruby": "Points = Data.define(:value)\n\nmodule PointRules\n  # => Points。不正なら ArgumentError を raise する\n  def self.points(value); end\n\n  # => Points\n  def self.earn(yen); end\n\n  # => Points。残高不足なら ArgumentError を raise する\n  def self.spend(balance, use); end\nend",
        "Rust": "#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]\npub struct Points(u32);\n\npub struct InsufficientPoints;\n\nimpl Points {\n    pub fn new(value: u32) -> Points { todo!() }\n    pub fn earn(yen: u32) -> Points { todo!() }\n    pub fn spend(self, used: Points) -> Result<Points, InsufficientPoints> { todo!() }\n}",
        "C#": "public readonly record struct Points(int Value);\n\npublic interface IPointRules\n{\n    Points? Create(int value); // 不正なら null\n    Points Earn(int yen);\n    Points? Spend(Points balance, Points use); // 残高不足なら null\n}",
        "Kotlin": "@JvmInline\nvalue class Points(val value: Int)\n\nfun points(value: Int): Result<Points> = TODO()\nfun earn(yen: Int): Points = TODO()\nfun spend(balance: Points, use: Points): Result<Points> = TODO()",
        "Swift": "struct Points: Equatable { let value: Int }\n\nenum PointsError: Error { case invalid, insufficient }\n\nprotocol PointRules {\n    func points(_ value: Int) -> Result<Points, PointsError>\n    func earn(yen: Int) -> Points\n    func spend(_ balance: Points, _ use: Points) -> Result<Points, PointsError>\n}"
      },
      "numType": {
        "TypeScript": "number",
        "JavaScript": "number",
        "Python": "int や float",
        "Java": "int や double",
        "Go": "int や float64",
        "Ruby": "Integer や Float",
        "Rust": "i64 や f64",
        "C#": "int や decimal",
        "Kotlin": "Int や Double",
        "Swift": "Int や Double"
      }
    }
  },
  {
    "title": "通知設定のデータ設計",
    "body": "## 背景\n\nアプリの通知設定画面の裏側を設計します。最初は「メール通知 ON/OFF」の真偽値 1 つでしたが、プッシュ通知・おやすみ時間・通知の種類ごとの設定が足され、真偽値が増え続けています。\n\nこのお題では、真偽値を並べる以外の表し方を話し合います。\n\n## いまの要望\n\n- 通知の経路はメールとプッシュの 2 つ\n- 通知の種類は「コメント」「メンション」「お知らせ」の 3 つで、種類ごとに経路を選べる\n- おやすみ時間（例: 22:00〜7:00）はプッシュを送らない\n- 「すべて止める」を押すと、個別の設定を残したまま全部止まる\n\n## 考慮すること\n\n- 真偽値が 6 個並ぶと、ありえない組み合わせや意味の分からない組み合わせができる\n- 「すべて止める」を解除したとき、前の個別の設定に戻るべきか\n- 新しい経路（例: チャット連携）が足されたとき、どこが変わるか\n\n話し合うこと:\n- 種類 × 経路を、真偽値の並びと表（マップ）のどちらで持つか\n- 「すべて止める」を個別の設定と別に持つ理由\n- おやすみ時間が日付をまたぐ場合の表し方\n- 設定の既定値はどこで決めるか（保存するか・読むときに補うか）\n\n満たすこと:\n- 通知設定の型の定義を書く\n- 「この通知をこの経路で、この時刻に送るか」を決める関数のシグネチャを書く\n- 新しい経路を足すときに直す場所を挙げる\n\nヒント:\n- 「送るか」を判定する関数を先に決めると、設定の型に要るものが見える\n- 日付をまたぐ時間帯は、開始 > 終了のときの扱いを決めておく",
    "difficulty": "easy",
    "category": "design",
    "slots": {}
  },
  {
    "title": "注文の状態と取消の規則",
    "body": "## 背景\n\nネットショップの注文を、受付から配達まで追う仕組みを設計します。注文には状態があり、状態によってできる操作が変わります。特に「取消」は、どの段階まで・誰が・何を戻すかで議論になりがちです。\n\n## 状態と操作\n\n- 状態: 受付済み → 支払い済み → 出荷準備中 → 出荷済み → 配達済み\n- 支払いに失敗すると「支払い失敗」になり、やり直せる\n- 購入者は出荷準備中までなら取消できる。支払い済みなら返金が要る\n- 出荷済み以降の取消はできず、返品の手続きになる\n- 店側は在庫切れを理由に、出荷済みより前ならいつでも取消できる\n\n## 考慮すること\n\n- 取消を 1 つの状態にするか、理由（購入者・在庫切れ）ごとに分けるか\n- 「返金が要る」ことを状態から導くか、別に記録するか\n- 返品は注文の状態か、別の集まり（返品の手続き）か\n\n話し合うこと:\n- 状態遷移図と、各遷移を起こす操作・起こせる人\n- 取消ができるかの判定を、注文の型の中に置くか外に置くか\n- 取消のあとに起きること（返金・在庫を戻す）を、注文が直接行うか出来事として知らせるか\n- 返品を注文の状態に入れたとき・分けたときの違い\n\n満たすこと:\n- 状態遷移図を描く（遷移ごとに操作名と起こせる人を書く）\n- 注文の状態の型と、取消の操作のシグネチャを書く\n- 取消のあとに起きることを、出来事の名前で 2 つ以上挙げる\n\n型のたたき台:\n```\n{{slot:typeSketch}}\n```\n\nヒント:\n- 「できない」操作を表に書き出すと、規則の抜けが見つかる\n- 返金や在庫の戻しは、注文の外の仕事として出来事で渡すと境界が分かれる",
    "difficulty": "medium",
    "category": "design",
    "slots": {
      "typeSketch": {
        "TypeScript": "type OrderStatus = 'accepted' | 'paid' | 'preparing' | 'shipped' | 'delivered' | 'paymentFailed' | 'cancelled';\ntype CancelReason = 'byCustomer' | 'outOfStock';\ndeclare function cancel(order: Order, reason: CancelReason, by: Actor): { order: Order; events: DomainEvent[] } | Error;",
        "JavaScript": "/** @typedef {'accepted' | 'paid' | 'preparing' | 'shipped' | 'delivered' | 'paymentFailed' | 'cancelled'} OrderStatus */\n/** @typedef {'byCustomer' | 'outOfStock'} CancelReason */\n\n/**\n * @param {Order} order\n * @param {CancelReason} reason\n * @param {Actor} by\n * @returns {{ order: Order, events: DomainEvent[] } | Error}\n */\nfunction cancel(order, reason, by) {}",
        "Python": "from __future__ import annotations\n\nfrom enum import Enum\n\n\nclass OrderStatus(Enum):\n    ACCEPTED = \"accepted\"\n    PAID = \"paid\"\n    PREPARING = \"preparing\"\n    SHIPPED = \"shipped\"\n    DELIVERED = \"delivered\"\n    PAYMENT_FAILED = \"payment_failed\"\n    CANCELLED = \"cancelled\"\n\n\nclass CancelReason(Enum):\n    BY_CUSTOMER = \"by_customer\"\n    OUT_OF_STOCK = \"out_of_stock\"\n\n\n# 取消できなければ CannotCancel を raise\ndef cancel(order: Order, reason: CancelReason, by: Actor) -> tuple[Order, list[DomainEvent]]: ...",
        "Java": "import java.util.List;\nimport java.util.Optional;\n\nenum OrderStatus { ACCEPTED, PAID, PREPARING, SHIPPED, DELIVERED, PAYMENT_FAILED, CANCELLED }\nenum CancelReason { BY_CUSTOMER, OUT_OF_STOCK }\n\nrecord Cancelled(Order order, List<DomainEvent> events) {}\n\ninterface OrderCancellation {\n    Optional<Cancelled> cancel(Order order, CancelReason reason, Actor by); // 取消できなければ empty\n}",
        "Go": "type OrderStatus int\n\nconst (\n\tAccepted OrderStatus = iota\n\tPaid\n\tPreparing\n\tShipped\n\tDelivered\n\tPaymentFailed\n\tCancelled\n)\n\ntype CancelReason int\n\nconst (\n\tByCustomer CancelReason = iota\n\tOutOfStock\n)\n\nfunc Cancel(order Order, reason CancelReason, by Actor) (Order, []DomainEvent, error)",
        "Ruby": "ORDER_STATUSES = %i[accepted paid preparing shipped delivered payment_failed cancelled].freeze\nCANCEL_REASONS = %i[by_customer out_of_stock].freeze\n\n# => [order, events]。取消できなければ CannotCancel を raise する\ndef cancel(order, reason:, by:); end",
        "Rust": "pub enum OrderStatus { Accepted, Paid, Preparing, Shipped, Delivered, PaymentFailed, Cancelled }\npub enum CancelReason { ByCustomer, OutOfStock }\n\npub fn cancel(order: Order, reason: CancelReason, by: Actor) -> Result<(Order, Vec<DomainEvent>), CancelError> {\n    todo!()\n}",
        "C#": "public enum OrderStatus { Accepted, Paid, Preparing, Shipped, Delivered, PaymentFailed, Cancelled }\npublic enum CancelReason { ByCustomer, OutOfStock }\n\npublic interface IOrderCancellation\n{\n    // 取消できなければ null\n    (Order Order, IReadOnlyList<DomainEvent> Events)? Cancel(Order order, CancelReason reason, Actor by);\n}",
        "Kotlin": "enum class OrderStatus { ACCEPTED, PAID, PREPARING, SHIPPED, DELIVERED, PAYMENT_FAILED, CANCELLED }\nenum class CancelReason { BY_CUSTOMER, OUT_OF_STOCK }\n\nfun cancel(order: Order, reason: CancelReason, by: Actor): Result<Pair<Order, List<DomainEvent>>> = TODO()",
        "Swift": "enum OrderStatus { case accepted, paid, preparing, shipped, delivered, paymentFailed, cancelled }\nenum CancelReason { case byCustomer, outOfStock }\n\nprotocol OrderCancellation {\n    func cancel(_ order: Order, reason: CancelReason, by: Requester) -> Result<(order: Order, events: [DomainEvent]), CancelError>\n}"
      }
    }
  },
  {
    "title": "在庫の引当と入出庫",
    "body": "## 背景\n\n倉庫の在庫を管理する仕組みを設計します。注文が入ると在庫を「引き当て」、出荷すると実際に減らします。棚卸しで数が合わないこともあります。\n\n「在庫数」を 1 つの数で持つと、引当中の分と実際に棚にある分の区別がつかず、売り越しや出荷漏れの原因になります。\n\n## 要件\n\n- 商品ごとに、棚にある数（実在庫）と、注文で押さえた数（引当数）がある\n- 売れる数 = 実在庫 − 引当数。売れる数を超えて引き当てられない\n- 出荷すると、実在庫と引当数が同じだけ減る\n- 注文の取消で引当を戻せる\n- 入荷で実在庫が増える。棚卸しで実在庫を数え直すことがある\n\n## 考慮すること\n\n- 数を上書きで持つか、入出庫の記録（増減の履歴）から求めるか\n- 棚卸しで実在庫が引当数より少なくなったら、どうするか\n- 倉庫が複数になったとき、どこが変わるか\n\n話し合うこと:\n- 在庫の型に持たせる数と、それぞれの不変条件\n- 引当を「どの注文の分か」まで記録するか、合計の数だけ持つか\n- 履歴から求める方式の利点（追跡できる）と代償（読むのが重い）\n- 棚卸しで不足が出たときに、誰に何を知らせるか\n\n満たすこと:\n- 在庫の型と、引当・出荷・取消・入荷・棚卸しの操作のシグネチャを書く\n- 不変条件を 2 つ以上書き、それを守る操作を対にする\n- 棚卸しで不足が出た場合の扱いを決めて書く\n\nヒント:\n- 引当を注文ごとに持つと、取消や部分出荷で「どれを戻すか」に迷わない\n- 不変条件が破れる入口（棚卸し）を先に洗い出す",
    "difficulty": "medium",
    "category": "design",
    "slots": {}
  },
  {
    "title": "割引ルールの組み合わせ",
    "body": "## 背景\n\nネットショップのカートに割引を適用する仕組みを設計します。割引の種類が増えるたびに if 文が足され、どの順で適用されるか誰も説明できなくなってきました。\n\n## いまある割引\n\n- クーポン: 合計から 500 円引き（合計 3000 円以上で使える）\n- 会員ランク割引: ゴールド会員は 5% 引き\n- まとめ買い: 同じ商品を 3 個以上買うとその商品が 10% 引き\n- セール商品はクーポンの対象外\n- クーポンは 1 注文に 1 枚まで\n\n## 考慮すること\n\n- 適用の順番で金額が変わる（500 円引きのあと 5% 引き、と、その逆）\n- 割引が明細に効くものと、合計に効くものがある\n- 端数（1 円未満）の丸めを、割引ごとにするか最後にまとめてするか\n- 「なぜこの金額になったか」を利用者に示す必要がある\n\n話し合うこと:\n- 割引を共通の型（インタフェース）で表すとき、入力と出力は何か\n- 適用の順番を誰が決めるか（割引自身が持つ優先度・外の設定）\n- 併用できない組み合わせの規則をどこに置くか\n- 内訳（どの割引でいくら引いたか）をどう返すか\n\n満たすこと:\n- 割引の型の定義と、割引を順に適用する関数のシグネチャを書く\n- 適用の順番と丸めの規則を決め、例 1 つで最終の金額を計算する\n- 新しい割引を足すときに直す場所を挙げる\n\n型のたたき台:\n```\n{{slot:typeSketch}}\n```\n\nヒント:\n- 明細に効く割引と合計に効く割引を、別の段に分けると順番が説明しやすい\n- 金額は整数（円）で持ち、丸めの場所を 1 つに決める",
    "difficulty": "medium",
    "category": "design",
    "slots": {
      "typeSketch": {
        "TypeScript": "type Discount = {\n  id: string;\n  appliesTo: (cart: Cart) => boolean;\n  apply: (cart: Cart) => { cart: Cart; line: { label: string; amount: number } };\n};",
        "JavaScript": "/**\n * @typedef {object} Discount\n * @property {string} id\n * @property {(cart: Cart) => boolean} appliesTo\n * @property {(cart: Cart) => { cart: Cart, line: { label: string, amount: number } }} apply\n */",
        "Python": "from __future__ import annotations\n\nfrom dataclasses import dataclass\nfrom typing import Protocol\n\n\n@dataclass(frozen=True)\nclass DiscountLine:\n    label: str\n    amount: int\n\n\nclass Discount(Protocol):\n    id: str\n\n    def applies_to(self, cart: Cart) -> bool: ...\n    def apply(self, cart: Cart) -> tuple[Cart, DiscountLine]: ...",
        "Java": "record DiscountLine(String label, int amount) {}\nrecord Applied(Cart cart, DiscountLine line) {}\n\ninterface Discount {\n    String id();\n    boolean appliesTo(Cart cart);\n    Applied apply(Cart cart);\n}",
        "Go": "type DiscountLine struct {\n\tLabel  string\n\tAmount int\n}\n\ntype Discount interface {\n\tID() string\n\tAppliesTo(cart Cart) bool\n\tApply(cart Cart) (Cart, DiscountLine)\n}",
        "Ruby": "DiscountLine = Data.define(:label, :amount)\n\nclass Discount\n  attr_reader :id\n\n  # => true / false\n  def applies_to?(cart)\n    raise NotImplementedError\n  end\n\n  # => [新しい cart, DiscountLine]\n  def apply(cart)\n    raise NotImplementedError\n  end\nend",
        "Rust": "pub struct DiscountLine {\n    pub label: String,\n    pub amount: i64,\n}\n\npub trait Discount {\n    fn id(&self) -> &str;\n    fn applies_to(&self, cart: &Cart) -> bool;\n    fn apply(&self, cart: Cart) -> (Cart, DiscountLine);\n}",
        "C#": "public record DiscountLine(string Label, int Amount);\n\npublic interface IDiscount\n{\n    string Id { get; }\n    bool AppliesTo(Cart cart);\n    (Cart Cart, DiscountLine Line) Apply(Cart cart);\n}",
        "Kotlin": "data class DiscountLine(val label: String, val amount: Int)\n\ninterface Discount {\n    val id: String\n    fun appliesTo(cart: Cart): Boolean\n    fun apply(cart: Cart): Pair<Cart, DiscountLine>\n}",
        "Swift": "struct DiscountLine { let label: String; let amount: Int }\n\nprotocol Discount {\n    var id: String { get }\n    func applies(to cart: Cart) -> Bool\n    func apply(to cart: Cart) -> (cart: Cart, line: DiscountLine)\n}"
      }
    }
  },
  {
    "title": "会員登録のエラー設計",
    "body": "## 背景\n\n会員登録の処理を設計します。入力の検証・重複の確認・保存・確認メールの送信と段階があり、それぞれ失敗します。いまは失敗のたびに例外を投げ、画面では「エラーが発生しました」としか出ていません。\n\nこのお題では、失敗をどう表し、どこで画面の文言に変えるかを話し合います。\n\n## 起きうる失敗\n\n- 入力の誤り: 名前が空・パスワードが短い・生年月日が未来（複数同時に起きる）\n- 業務の規則: 同じ利用者名がすでにある\n- 外部の失敗: データベースにつながらない・メールが送れない\n- 想定外: プログラムの誤り\n\n## 考慮すること\n\n- 利用者が直せる失敗と、直せない失敗を分けるか\n- 入力の誤りは 1 つずつ返すか、まとめて返すか\n- 保存は成功しメールだけ失敗したとき、登録は成功か失敗か\n- エラーの型が文言を持つと、表示の言語や言い回しを変えるたびにドメインを直すことになる\n\n話し合うこと:\n- 失敗の分類と、それぞれを例外・結果の値のどちらで表すか\n- エラーの型に持たせるもの（種類・どの項目か・値）と持たせないもの（表示の文言）\n- 画面の文言に変える場所（境界）はどこか\n- メール送信の失敗を登録の失敗に含めるか\n\n満たすこと:\n- エラーの型の定義を書く（判別できる共用体などで）\n- 登録の関数のシグネチャを書き、成功と失敗の返し方を示す\n- エラーの種類ごとに、画面での見せ方を表にする\n\n型のたたき台:\n```\n{{slot:typeSketch}}\n```\n\nヒント:\n- 「利用者が次に何をすればよいか」で分類すると、型の分け方が決めやすい",
    "difficulty": "medium",
    "category": "design",
    "slots": {
      "typeSketch": {
        "TypeScript": "type SignupError =\n  | { kind: 'invalid'; fields: { field: string; rule: string }[] }\n  | { kind: 'duplicateUsername' }\n  | { kind: 'unavailable' };\ndeclare function signup(input: SignupInput): Promise<{ ok: true; userId: string } | { ok: false; error: SignupError }>;",
        "JavaScript": "/**\n * @typedef {{ kind: 'invalid', fields: { field: string, rule: string }[] }\n *   | { kind: 'duplicateUsername' }\n *   | { kind: 'unavailable' }} SignupError\n */\n\n/**\n * @param {SignupInput} input\n * @returns {Promise<{ ok: true, userId: string } | { ok: false, error: SignupError }>}\n */\nasync function signup(input) {}",
        "Python": "from __future__ import annotations\n\nfrom dataclasses import dataclass\n\n\n@dataclass(frozen=True)\nclass FieldError:\n    field: str\n    rule: str\n\n\n@dataclass(frozen=True)\nclass Invalid:\n    fields: list[FieldError]\n\n\n@dataclass(frozen=True)\nclass DuplicateUsername:\n    pass\n\n\n@dataclass(frozen=True)\nclass Unavailable:\n    pass\n\n\nSignupError = Invalid | DuplicateUsername | Unavailable\n\n\n# 成功なら利用者の ID、失敗なら SignupError を返す\nasync def signup(form: SignupInput) -> str | SignupError: ...",
        "Java": "import java.util.List;\nimport java.util.concurrent.CompletableFuture;\n\nrecord FieldError(String field, String rule) {}\n\nsealed interface SignupError permits Invalid, DuplicateUsername, Unavailable {}\nrecord Invalid(List<FieldError> fields) implements SignupError {}\nrecord DuplicateUsername() implements SignupError {}\nrecord Unavailable() implements SignupError {}\n\nsealed interface SignupResult permits SignedUp, Failed {}\nrecord SignedUp(String userId) implements SignupResult {}\nrecord Failed(SignupError error) implements SignupResult {}\n\ninterface SignupService {\n    CompletableFuture<SignupResult> signup(SignupInput input);\n}",
        "Go": "import \"context\"\n\ntype FieldError struct {\n\tField string\n\tRule  string\n}\n\ntype SignupErrorKind int\n\nconst (\n\tInvalid SignupErrorKind = iota\n\tDuplicateUsername\n\tUnavailable\n)\n\ntype SignupError struct {\n\tKind   SignupErrorKind\n\tFields []FieldError // Kind が Invalid のときだけ\n}\n\nfunc (e *SignupError) Error() string\n\n// 失敗のときは *SignupError を返す\nfunc Signup(ctx context.Context, input SignupInput) (userID string, err error)",
        "Ruby": "FieldError = Data.define(:field, :rule)\n\nmodule SignupError\n  Invalid = Data.define(:fields)\n  DuplicateUsername = Data.define\n  Unavailable = Data.define\nend\n\n# => [:ok, user_id] か [:error, SignupError のどれか]\ndef signup(input); end",
        "Rust": "pub struct FieldError {\n    pub field: String,\n    pub rule: String,\n}\n\npub enum SignupError {\n    Invalid { fields: Vec<FieldError> },\n    DuplicateUsername,\n    Unavailable,\n}\n\npub async fn signup(input: SignupInput) -> Result<String, SignupError> { todo!() }",
        "C#": "public record FieldError(string Field, string Rule);\n\npublic abstract record SignupError\n{\n    public sealed record Invalid(IReadOnlyList<FieldError> Fields) : SignupError;\n    public sealed record DuplicateUsername() : SignupError;\n    public sealed record Unavailable() : SignupError;\n}\n\npublic abstract record SignupResult\n{\n    public sealed record Ok(string UserId) : SignupResult;\n    public sealed record Failed(SignupError Error) : SignupResult;\n}\n\npublic interface ISignupService\n{\n    Task<SignupResult> SignupAsync(SignupInput input);\n}",
        "Kotlin": "data class FieldError(val field: String, val rule: String)\n\nsealed interface SignupError {\n    data class Invalid(val fields: List<FieldError>) : SignupError\n    data object DuplicateUsername : SignupError\n    data object Unavailable : SignupError\n}\n\nsealed interface SignupResult {\n    data class Ok(val userId: String) : SignupResult\n    data class Failed(val error: SignupError) : SignupResult\n}\n\nsuspend fun signup(input: SignupInput): SignupResult = TODO()",
        "Swift": "struct FieldError { let field: String; let rule: String }\n\nenum SignupError: Error {\n    case invalid(fields: [FieldError])\n    case duplicateUsername\n    case unavailable\n}\n\nprotocol SignupService {\n    func signup(_ input: SignupInput) async -> Result<String, SignupError>\n}"
      }
    }
  },
  {
    "title": "文書共有の権限モデル",
    "body": "## 背景\n\nチームで文書を共有するサービスの権限を設計します。最初は「持ち主」と「それ以外」だけでしたが、閲覧だけの人・コメントできる人・フォルダごとの共有・外部の人への共有と、要望が増えています。\n\n## 要件\n\n- 役割: 持ち主・編集者・コメント者・閲覧者\n- 文書はフォルダに入り、フォルダの共有は中の文書に引き継がれる\n- 文書ごとに、フォルダより強い権限を足せる（弱めることはできない）\n- 組織の外の人には閲覧者までしか与えられない\n- 持ち主は必ず 1 人いる\n\n## 考慮すること\n\n- 「この人はこの文書を編集できるか」を求めるとき、何を見る必要があるか\n- 役割を順序つきの値（閲覧 < コメント < 編集 < 持ち主）とみなせるか\n- 権限の判定を、文書の型の中に置くか、別の仕組みにするか\n- 持ち主が退職したときに「必ず 1 人」をどう守るか\n\n話し合うこと:\n- 役割と操作（読む・コメント・編集・共有・削除）の対応表\n- フォルダからの引き継ぎと文書ごとの共有を合わせて、実際の権限を求める手順\n- 「外部の人は閲覧まで」の規則を、共有するときに止めるか判定のときに止めるか\n- 権限の判定を呼ぶ側（画面・API）と判定する側の境界\n\n満たすこと:\n- 役割 × 操作の表を書く\n- 実際の権限を求める関数のシグネチャを書く\n- 規則（弱められない・外部は閲覧まで・持ち主は 1 人）を守る場所を対にして書く\n\nヒント:\n- 「できるか」を 1 つの関数に集めると、画面と API で判定がずれない\n- 役割を順序つきにすると「強い方を取る」が 1 行で書ける",
    "difficulty": "medium",
    "category": "design",
    "slots": {}
  },
  {
    "title": "座席の仮押さえと二重確保",
    "body": "## 背景\n\nコンサートの座席を予約するサービスを設計します。購入者は座席を選ぶと 10 分間「仮押さえ」でき、その間に支払いを済ませます。人気の公演では、同じ座席を同じ瞬間に何百人も選びます。\n\n仮押さえの期限切れ・支払いの遅れ・二重の確保が絡み、単純な「空いていれば取る」では破綻します。\n\n## 要件\n\n- 1 つの座席は、同時に 1 人しか仮押さえ・購入できない\n- 仮押さえは 10 分で切れ、切れた座席は他の人が選べる\n- 期限内に支払いが始まれば、支払いの結果が出るまで座席は保たれる\n- 支払いの結果は外部のサービスから遅れて届くことがある（期限の後に成功が届くことも）\n- 1 人 1 公演 4 席まで\n\n## 考慮すること\n\n- 「空いているか確かめてから取る」の間に、他の人が取るかもしれない\n- 期限切れを、時刻が来たら誰かが状態を変えるのか、読むときに時刻と比べて判断するのか\n- 期限の後に支払い成功が届いたら、座席を渡すのか返金するのか\n- 「1 人 4 席まで」は座席をまたぐ規則で、座席 1 つずつを見ても守れない\n\n話し合うこと:\n- 集約の単位（座席 1 つ・公演全体・購入者ごと）と、その選び方で何が変わるか\n- 二重確保を防ぐ仕組み（一意の制約・版による楽観的な排他・ロック）の比べ方\n- 時刻をどこから受け取るか、期限切れをどう判定するか\n- 遅れて届いた支払い成功の扱いと、そのとき誰に何を知らせるか\n- 「4 席まで」を確実に守るか、まれな超過を後で正すか\n\n満たすこと:\n- 座席の状態遷移図を描く（空き・仮押さえ・支払い中・購入済み、期限切れの遷移を含む）\n- 集約の単位を決め、選んだ理由と諦めたことを書く\n- 仮押さえの操作のシグネチャを書き、競合したときの返し方を示す\n- 遅れて届いた支払い成功の扱いを決めて書く\n\n型のたたき台:\n```\n{{slot:typeSketch}}\n```\n\nヒント:\n- 期限切れは「読むときに now と比べる」にすると、時刻で動く仕組みが要らなくなる\n- 集約をまたぐ規則は、確実に守る範囲と、後で正す範囲に分けて考える",
    "difficulty": "hard",
    "category": "design",
    "slots": {
      "typeSketch": {
        "TypeScript": "type Seat =\n  | { kind: 'free'; version: number }\n  | { kind: 'held'; by: string; until: Date; version: number }\n  | { kind: 'paying'; by: string; paymentId: string; version: number }\n  | { kind: 'sold'; by: string; version: number };\ndeclare function hold(seat: Seat, buyer: string, now: Date): Seat | { conflict: true };",
        "JavaScript": "/**\n * @typedef {{ kind: 'free', version: number }\n *   | { kind: 'held', by: string, until: Date, version: number }\n *   | { kind: 'paying', by: string, paymentId: string, version: number }\n *   | { kind: 'sold', by: string, version: number }} Seat\n */\n\n/**\n * @param {Seat} seat\n * @param {string} buyer\n * @param {Date} now\n * @returns {Seat | { conflict: true }}\n */\nfunction hold(seat, buyer, now) {}",
        "Python": "from dataclasses import dataclass\nfrom datetime import datetime\n\n\n@dataclass(frozen=True)\nclass Free:\n    version: int\n\n\n@dataclass(frozen=True)\nclass Held:\n    by: str\n    until: datetime\n    version: int\n\n\n@dataclass(frozen=True)\nclass Paying:\n    by: str\n    payment_id: str\n    version: int\n\n\n@dataclass(frozen=True)\nclass Sold:\n    by: str\n    version: int\n\n\nSeat = Free | Held | Paying | Sold\n\n\n@dataclass(frozen=True)\nclass Conflict:\n    pass\n\n\ndef hold(seat: Seat, buyer: str, now: datetime) -> Seat | Conflict: ...",
        "Java": "import java.time.Instant;\nimport java.util.Optional;\n\nsealed interface Seat permits Free, Held, Paying, Sold {\n    int version();\n}\nrecord Free(int version) implements Seat {}\nrecord Held(String by, Instant until, int version) implements Seat {}\nrecord Paying(String by, String paymentId, int version) implements Seat {}\nrecord Sold(String by, int version) implements Seat {}\n\ninterface SeatHolding {\n    Optional<Seat> hold(Seat seat, String buyer, Instant now); // 競合なら empty\n}",
        "Go": "import (\n\t\"errors\"\n\t\"time\"\n)\n\ntype Seat interface{ Version() int }\n\ntype Free struct{ version int }\ntype Held struct {\n\tBy      string\n\tUntil   time.Time\n\tversion int\n}\ntype Paying struct {\n\tBy        string\n\tPaymentID string\n\tversion   int\n}\ntype Sold struct {\n\tBy      string\n\tversion int\n}\n\nfunc (s Free) Version() int   { return s.version }\nfunc (s Held) Version() int   { return s.version }\nfunc (s Paying) Version() int { return s.version }\nfunc (s Sold) Version() int   { return s.version }\n\nvar ErrConflict = errors.New(\"seat conflict\")\n\nfunc Hold(seat Seat, buyer string, now time.Time) (Seat, error)",
        "Ruby": "Free = Data.define(:version)\nHeld = Data.define(:by, :until_at, :version)\nPaying = Data.define(:by, :payment_id, :version)\nSold = Data.define(:by, :version)\n\n# => 新しい座席。競合なら :conflict\ndef hold(seat, buyer, now); end",
        "Rust": "use chrono::{DateTime, Utc};\n\npub enum Seat {\n    Free { version: u64 },\n    Held { by: String, until: DateTime<Utc>, version: u64 },\n    Paying { by: String, payment_id: String, version: u64 },\n    Sold { by: String, version: u64 },\n}\n\npub struct Conflict;\n\npub fn hold(seat: &Seat, buyer: &str, now: DateTime<Utc>) -> Result<Seat, Conflict> { todo!() }",
        "C#": "public abstract record Seat(int Version)\n{\n    public sealed record Free(int Version) : Seat(Version);\n    public sealed record Held(string By, DateTimeOffset Until, int Version) : Seat(Version);\n    public sealed record Paying(string By, string PaymentId, int Version) : Seat(Version);\n    public sealed record Sold(string By, int Version) : Seat(Version);\n}\n\npublic interface ISeatHolding\n{\n    Seat? Hold(Seat seat, string buyer, DateTimeOffset now); // 競合なら null\n}",
        "Kotlin": "import java.time.Instant\n\nsealed interface Seat {\n    val version: Int\n    data class Free(override val version: Int) : Seat\n    data class Held(val by: String, val until: Instant, override val version: Int) : Seat\n    data class Paying(val by: String, val paymentId: String, override val version: Int) : Seat\n    data class Sold(val by: String, override val version: Int) : Seat\n}\n\nfun hold(seat: Seat, buyer: String, now: Instant): Seat? = TODO() // 競合なら null",
        "Swift": "import Foundation\n\nenum Seat {\n    case free(version: Int)\n    case held(by: String, until: Date, version: Int)\n    case paying(by: String, paymentId: String, version: Int)\n    case sold(by: String, version: Int)\n}\n\nstruct Conflict: Error {}\n\nprotocol SeatHolding {\n    func hold(_ seat: Seat, buyer: String, now: Date) -> Result<Seat, Conflict>\n}"
      }
    }
  },
  {
    "title": "ポイント失効と返品の巻き戻し",
    "body": "## 背景\n\nポイントカードに「有効期限」が付くことになりました。ポイントは貯めた日から 1 年で失効し、使うときは期限の近いものから使います。さらに、ポイントを使った購入や、ポイントが貯まった購入が返品されることがあります。\n\n残高を 1 つの数で持っていると、どのポイントがいつ失効するか・返品で何を戻すかが分からなくなります。\n\n## ルール\n\n- 購入で貯まったポイントは、貯めた日から 365 日後に失効する\n- 使うときは、失効の近いポイントから順に使う\n- ポイントで支払った購入が返品されたら、使ったポイントを戻す。ただし戻すポイントの期限は元のまま（すでに過ぎていれば戻した瞬間に失効扱い）\n- ポイントが貯まった購入が返品されたら、そのポイントを取り消す。すでに使っていたら、残高をマイナスにはせず、次に貯まる分から差し引く\n- 残高の表示には「◯月◯日に◯ポイント失効」を出す\n\n## 考慮すること\n\n- 残高を「期限ごとのまとまり」の一覧で持つか、増減の記録から毎回求めるか\n- 返品の日と、元の購入の日と、失効の日の 3 つの時刻が絡む\n- 「次に貯まる分から差し引く」借りを、どこに持つか\n- 夜中の 0 時に失効させるとき、どのタイムゾーンの 0 時か\n\n話し合うこと:\n- ポイントの型（いつ貯めたか・いつ失効するか・どの購入由来か）と残高の表し方\n- 使ったときに「どのまとまりから何ポイント使ったか」を記録する理由\n- 返品の 2 つの場合それぞれで、何をどう戻すか\n- 差し引きの借りを残高のまとまりに混ぜるか、別に持つか\n- 失効の判定を時刻の引数で行うときの境界（365 日目の扱い）\n\n満たすこと:\n- 残高と使用の記録の型の定義を書く\n- 使う・失効を求める・返品で戻す操作のシグネチャを書く\n- 次の筋書きで、各時点の残高のまとまりを表で書く: 1 月に 100、3 月に 50 貯める → 4 月に 120 使う → 1 月の購入を返品\n- 決めきれなかったことを 1 つ以上挙げる\n\nヒント:\n- 使用の記録に「どのまとまりから」を残すと、返品で戻す先が一意に決まる\n- 時刻は必ず引数で受け取り、「いま」を内側で読まない",
    "difficulty": "hard",
    "category": "design",
    "slots": {}
  },
  {
    "title": "定期購読のプラン変更",
    "body": "## 背景\n\n月額の定期購読サービスの課金を設計します。利用者は月の途中でプランを上げたり下げたり、解約したりします。日割り・請求の締め・支払いの失敗が絡み、「いまどのプランで、次にいくら請求されるか」を正しく答えるのは意外に難しいお題です。\n\n## ルール\n\n- プラン: ライト 500 円・スタンダード 1000 円・プロ 2000 円（月額）\n- 請求は申し込んだ日を起点に毎月同じ日。31 日に申し込んだ人の 2 月は月末\n- 上げる変更はすぐ効き、残りの日数分の差額を日割りで請求する\n- 下げる変更と解約は、次の請求日から効く（それまでは今のプランが使える）\n- 支払いに失敗したら 7 日の猶予があり、その間は使える。猶予の後は止まる\n- 次の請求日より前なら、予約した下げる変更や解約を取り消せる\n\n## 考慮すること\n\n- 「今のプラン」と「次の請求日からのプラン」を別に持つ必要がある\n- 日割りは日数で割るのか、秒で割るのか。端数をどちらに丸めるか\n- 同じ請求期間の中で、上げる・下げる・上げる、と何度も変えられたら\n- 請求日の「その日」は利用者のタイムゾーンか、サービスのタイムゾーンか\n\n話し合うこと:\n- 購読の状態（使用中・猶予中・停止・解約予約）と、プランの予約の表し方\n- 請求期間を値として持つか、起点の日から毎回求めるか（月末の扱い）\n- 日割りの計算をどの型の責務にするか、丸めの規則\n- 支払いの失敗・猶予・停止を、購読と請求のどちらの状態にするか\n- 1 期間に何度も変更したときの請求を、どう積み上げるか\n\n満たすこと:\n- 購読の型と状態遷移図を書く\n- プラン変更の操作のシグネチャを書く（時刻を引数で受け取る）\n- 次の筋書きの請求額を計算する: 1 月 31 日にライトで申し込む → 2 月 10 日にプロへ上げる → 2 月 20 日にスタンダードへ下げる予約\n- 月末の起点日の扱いを決めて書く\n\nヒント:\n- 「今」と「予約」を分けて持つと、下げる変更と解約が同じ形で扱える\n- 請求の明細を出来事の列として残すと、何度も変えた期間の説明がつく",
    "difficulty": "hard",
    "category": "design",
    "slots": {}
  },
  {
    "title": "口座間送金の整合性",
    "body": "## 背景\n\n利用者同士がお金を送り合えるサービスの送金を設計します。送り手の口座から減らし、受け手の口座へ増やす。2 つの口座は別の集約で、別のデータベースに分かれる可能性もあります。\n\n「減らしたが増やす前に落ちた」「通信が切れて利用者がもう一度押した」ときにお金が消えたり増えたりしないことが、このお題の考えどころです。\n\n## 要件\n\n- 送り手の残高を超えて送れない（残高は負にならない）\n- 送金は途中で失敗しても、最後には「両方済んだ」か「両方戻った」のどちらかになる\n- 利用者が同じ送金を 2 回押しても、1 回分しか動かない\n- 送金の途中の状態は利用者に見える（「処理中」）\n- 1 日の送金の合計に上限がある（送り手ごと）\n\n## 考慮すること\n\n- 2 つの口座を 1 つの取引で更新できない前提で、順序をどうするか\n- 送り手から先に減らすか、受け手の受け入れを先に確かめるか\n- 再送の識別子（冪等キー）を誰が作り、どこで覚えるか\n- 受け手の口座が凍結されていたら、減らした分をどう戻すか\n- 「1 日の合計」の 1 日の境目\n\n話し合うこと:\n- 送金を独立した集約（送金の記録）にするかどうかと、その状態遷移\n- 段階ごとの失敗と、そのとき戻す操作（補償）の一覧\n- 冪等キーの扱いと、同じキーで中身が違う要求が来たときの返し方\n- 残高の不変条件と 1 日の上限を、それぞれどの集約で守るか\n- 「処理中」が長く続いたときに、誰が気づいて何をするか\n\n満たすこと:\n- 送金の状態遷移図を描く（補償の遷移を含む）\n- 送金・口座の型と、送金を始める操作のシグネチャを書く\n- 失敗の場面を 3 つ以上挙げ、それぞれの最終の状態を書く\n- 冪等キーの扱いを決めて書く\n\n型のたたき台:\n```\n{{slot:typeSketch}}\n```\n\nヒント:\n- 「送金の記録」を先に保存してから口座を動かすと、途中で落ちても続きが分かる\n- 補償は「取り消し」ではなく「逆向きの操作」として記録に残す",
    "difficulty": "hard",
    "category": "design",
    "slots": {
      "typeSketch": {
        "TypeScript": "type Transfer =\n  | { kind: 'requested'; id: string; idempotencyKey: string; from: string; to: string; amount: number }\n  | { kind: 'debited'; id: string }\n  | { kind: 'completed'; id: string }\n  | { kind: 'compensated'; id: string; reason: string };",
        "JavaScript": "/**\n * @typedef {{ kind: 'requested', id: string, idempotencyKey: string, from: string, to: string, amount: number }\n *   | { kind: 'debited', id: string }\n *   | { kind: 'completed', id: string }\n *   | { kind: 'compensated', id: string, reason: string }} Transfer\n */",
        "Python": "from dataclasses import dataclass\n\n\n@dataclass(frozen=True)\nclass Requested:\n    id: str\n    idempotency_key: str\n    from_account: str\n    to_account: str\n    amount: int\n\n\n@dataclass(frozen=True)\nclass Debited:\n    id: str\n\n\n@dataclass(frozen=True)\nclass Completed:\n    id: str\n\n\n@dataclass(frozen=True)\nclass Compensated:\n    id: str\n    reason: str\n\n\nTransfer = Requested | Debited | Completed | Compensated",
        "Java": "sealed interface Transfer permits Requested, Debited, Completed, Compensated {\n    String id();\n}\nrecord Requested(String id, String idempotencyKey, String from, String to, long amount) implements Transfer {}\nrecord Debited(String id) implements Transfer {}\nrecord Completed(String id) implements Transfer {}\nrecord Compensated(String id, String reason) implements Transfer {}",
        "Go": "type Transfer interface{ TransferID() string }\n\ntype Requested struct {\n\tID             string\n\tIdempotencyKey string\n\tFrom, To       string\n\tAmount         int64\n}\ntype Debited struct{ ID string }\ntype Completed struct{ ID string }\ntype Compensated struct{ ID, Reason string }\n\nfunc (t Requested) TransferID() string   { return t.ID }\nfunc (t Debited) TransferID() string     { return t.ID }\nfunc (t Completed) TransferID() string   { return t.ID }\nfunc (t Compensated) TransferID() string { return t.ID }",
        "Ruby": "module Transfer\n  Requested = Data.define(:id, :idempotency_key, :from, :to, :amount)\n  Debited = Data.define(:id)\n  Completed = Data.define(:id)\n  Compensated = Data.define(:id, :reason)\nend",
        "Rust": "pub enum Transfer {\n    Requested { id: String, idempotency_key: String, from: String, to: String, amount: u64 },\n    Debited { id: String },\n    Completed { id: String },\n    Compensated { id: String, reason: String },\n}",
        "C#": "public abstract record Transfer(string Id)\n{\n    public sealed record Requested(string Id, string IdempotencyKey, string From, string To, decimal Amount) : Transfer(Id);\n    public sealed record Debited(string Id) : Transfer(Id);\n    public sealed record Completed(string Id) : Transfer(Id);\n    public sealed record Compensated(string Id, string Reason) : Transfer(Id);\n}",
        "Kotlin": "sealed interface Transfer {\n    val id: String\n    data class Requested(override val id: String, val idempotencyKey: String, val from: String, val to: String, val amount: Long) : Transfer\n    data class Debited(override val id: String) : Transfer\n    data class Completed(override val id: String) : Transfer\n    data class Compensated(override val id: String, val reason: String) : Transfer\n}",
        "Swift": "enum Transfer {\n    case requested(id: String, idempotencyKey: String, from: String, to: String, amount: Int)\n    case debited(id: String)\n    case completed(id: String)\n    case compensated(id: String, reason: String)\n}"
      }
    }
  },
  {
    "title": "勤務シフトの制約設計",
    "body": "## 背景\n\n飲食店の勤務シフトを組む仕組みを設計します。店長がシフトを入れ、従業員は希望を出し、交代を頼み合います。働き方の規則は従業員をまたぎ、週をまたぎ、日付をまたぐため、「1 枠ずつ確かめる」では守れません。\n\n## 規則\n\n- 各時間帯に必要な人数がある（例: 平日昼は 3 人、うち 1 人は責任者）\n- 1 人の勤務は 1 週間で 40 時間まで\n- 勤務と次の勤務の間は 11 時間以上あける（夜 23 時まで働いたら翌朝 10 時以降）\n- 22 時〜5 時をまたぐ勤務は深夜の扱い。18 歳未満は深夜に入れない\n- 従業員同士の交代は、交代した後も上の規則を全部満たすときだけ認める\n- 店長と従業員が同時にシフトを直すことがある\n\n## 考慮すること\n\n- 規則が見る範囲が違う: 1 枠（必要人数）・1 人の 1 週（40 時間）・1 人の前後の勤務（11 時間）\n- 週の区切り（月曜始まりか日曜始まりか）と、日付をまたぐ勤務がどちらの週に入るか\n- 規則を破るシフトを保存できなくするか、保存はして警告を出すか\n- 2 人が同時に直したとき、どちらかの変更で規則が破れることがある\n\n話し合うこと:\n- 集約の単位（1 日・1 週・1 人・店全体）と、規則ごとにどの範囲を読む必要があるか\n- 規則を 1 つずつ独立した判定にして並べる形と、その入力の型\n- 守れなかった規則の返し方（どの規則・誰・どの時間帯）\n- 「保存を止める規則」と「警告にとどめる規則」の線引き\n- 同時の編集をどう検出し、利用者にどう見せるか\n\n満たすこと:\n- シフト・従業員・規則の型の定義を書く\n- 規則の判定の共通の形（シグネチャ）を 1 つ書き、規則を 3 つその形で表す\n- 交代の申請が通る条件を、判定の組み合わせとして書く\n- 日付をまたぐ勤務の週の帰属と 11 時間の判定を、例 1 つで確かめる\n\n型のたたき台:\n```\n{{slot:typeSketch}}\n```\n\nヒント:\n- 規則ごとに「何を読めば判定できるか」を書き出すと、集約の大きさが決まる\n- 判定は純粋な関数にして、保存の可否はその結果を見て外で決める",
    "difficulty": "hard",
    "category": "design",
    "slots": {
      "typeSketch": {
        "TypeScript": "type Violation = { rule: string; staffId?: string; slot?: { start: Date; end: Date } };\ntype Rule = (schedule: WeekSchedule, staff: Staff[]) => Violation[];",
        "JavaScript": "/** @typedef {{ rule: string, staffId?: string, slot?: { start: Date, end: Date } }} Violation */\n/** @typedef {(schedule: WeekSchedule, staff: Staff[]) => Violation[]} Rule */",
        "Python": "from __future__ import annotations\n\nfrom dataclasses import dataclass\nfrom datetime import datetime\nfrom typing import Protocol\n\n\n@dataclass(frozen=True)\nclass TimeRange:\n    start: datetime\n    end: datetime\n\n\n@dataclass(frozen=True)\nclass Violation:\n    rule: str\n    staff_id: str | None = None\n    slot: TimeRange | None = None\n\n\nclass Rule(Protocol):\n    def __call__(self, schedule: WeekSchedule, staff: list[Staff]) -> list[Violation]: ...",
        "Java": "import java.time.Instant;\nimport java.util.List;\nimport java.util.Optional;\n\nrecord TimeRange(Instant start, Instant end) {}\nrecord Violation(String rule, Optional<String> staffId, Optional<TimeRange> slot) {}\n\n@FunctionalInterface\ninterface Rule {\n    List<Violation> check(WeekSchedule schedule, List<Staff> staff);\n}",
        "Go": "import \"time\"\n\ntype TimeRange struct{ Start, End time.Time }\n\ntype Violation struct {\n\tRule    string\n\tStaffID string     // 空なら特定の人に依らない\n\tSlot    *TimeRange // nil なら特定の時間帯に依らない\n}\n\ntype Rule func(schedule WeekSchedule, staff []Staff) []Violation",
        "Ruby": "TimeRange = Data.define(:start_at, :end_at)\nViolation = Data.define(:rule, :staff_id, :slot) # staff_id と slot は nil もある\n\n# 規則は call(schedule, staff) で Violation の配列を返すもの（lambda など）\n# 例: max_weekly_hours = ->(schedule, staff) { [] }",
        "Rust": "use chrono::{DateTime, Utc};\n\npub struct TimeRange {\n    pub start: DateTime<Utc>,\n    pub end: DateTime<Utc>,\n}\n\npub struct Violation {\n    pub rule: String,\n    pub staff_id: Option<String>,\n    pub slot: Option<TimeRange>,\n}\n\npub trait Rule {\n    fn check(&self, schedule: &WeekSchedule, staff: &[Staff]) -> Vec<Violation>;\n}",
        "C#": "public record TimeRange(DateTimeOffset Start, DateTimeOffset End);\npublic record Violation(string Rule, string? StaffId = null, TimeRange? Slot = null);\n\npublic delegate IReadOnlyList<Violation> Rule(WeekSchedule schedule, IReadOnlyList<Staff> staff);",
        "Kotlin": "import java.time.Instant\n\ndata class TimeRange(val start: Instant, val end: Instant)\ndata class Violation(val rule: String, val staffId: String? = null, val slot: TimeRange? = null)\n\ntypealias Rule = (schedule: WeekSchedule, staff: List<Staff>) -> List<Violation>",
        "Swift": "import Foundation\n\nstruct TimeRange { let start: Date; let end: Date }\nstruct Violation { let rule: String; var staffId: String?; var slot: TimeRange? }\n\ntypealias Rule = (_ schedule: WeekSchedule, _ staff: [Staff]) -> [Violation]"
      }
    }
  }
];
