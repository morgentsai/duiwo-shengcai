export type AccountKind = 'bank' | 'cash' | 'card' | 'broker' | 'loan'

export interface Account {
  id: string
  name: string
  kind: AccountKind
  tag?: string
  /** bank / cash: 餘額；loan: 未償本金；broker: 不使用 */
  balance: number
  /** 信用卡 */
  primary?: boolean
  payAccountId?: string
  statementDay?: number
  dueDay?: number
  /** 本期已出帳應繳 */
  billed?: number
  /** 未出帳 */
  unbilled?: number
  /** 證券戶：交割銀行與每月定期投入；broker.balance = 交割戶現金（計入投資） */
  settlementId?: string
  /** 證券戶：開始在 App 追蹤前已投入的本金 */
  principalBase?: number
  monthlyTarget?: number
  /** 現金錢包每月領現目標 */
  cashTarget?: number
  color?: string
  /** 外幣存款：幣別（USD/EUR/JPY/CNY/AUD/多幣別）；未設定代表台幣。balance 一律存「約當台幣」 */
  currency?: string
  /** 外幣原幣餘額 */
  fxBalance?: number
  /** 匯率：1 單位外幣 = 多少台幣 */
  fxRate?: number
  /** 儲蓄帳戶：轉入這裡的錢算「儲蓄」（證券戶一律算） */
  savings?: boolean
}

export const FX_CURRENCIES = ['USD', 'EUR', 'JPY', 'CNY', 'AUD', '多幣別'] as const
export const isFx = (a: { currency?: string }) => !!a.currency && a.currency !== 'TWD'

export type TxType = 'expense' | 'income' | 'transfer'
export type TxTag = 'withdraw' | 'cardpay' | 'etf' | 'payday' | 'collect' | 'trade' | 'dividend'

export interface Tx {
  id: string
  type: TxType
  date: string // YYYY-MM-DD
  amount: number
  category?: string
  fromId?: string
  toId?: string
  note?: string
  tag?: TxTag
  /** 繳卡費時沖銷的拆分（用於精準回補） */
  split?: { billed: number; unbilled: number }
  flowKey?: string
  /** 子分類（選填） */
  sub?: string
  /** 專案標籤（選填，例如 2026 花蓮） */
  project?: string
  /** 轉帳群組（例如「11 月卡費分流」），明細預設折疊 */
  groupId?: string
  groupTitle?: string
  /** 分帳：付款工具扣總額 amount；mine 計入支出，其餘記為待收代墊 */
  share?: { mine: number; parts: { name: string; amount: number }[] }
  /** 收回代墊：沖銷的待收 id */
  receivableIds?: string[]
  /** 證券交易（買進／賣出／配息） */
  trade?: Trade
}

export interface Trade {
  kind: 'buy' | 'sell' | 'dividend'
  brokerId: string
  symbol: string
  name: string
  shares: number
  price: number
  fee: number
  /** 賣出當下的平均成本（用於回補） */
  costAtSell?: number
}

export interface Receivable {
  id: string
  txId: string
  friend: string
  amount: number
  date: string
  note?: string
  /** 收回紀錄的交易 id */
  collectedBy?: string
}

export interface InvSnapshot {
  month: string
  principal: number
  value: number
}

export interface Holding {
  id: string
  brokerId: string
  symbol: string
  name: string
  shares: number
  cost: number // 平均成本/股
  price: number // 現價
}

export interface AppState {
  version: 2
  isDemo: boolean
  accounts: Account[]
  txs: Tx[]
  holdings: Holding[]
  budgets: Record<string, number>
  flow: { month: string; done: Record<string, string[]> }
  /** 使用者自訂支出分類與子分類 */
  catExtra?: { cats?: { key: string; emoji?: string }[]; subs?: Record<string, string[]> }
  /** 使用者編輯過分類後的完整支出分類清單（順序、名稱、圖示、隱藏）；沒有時用內建＋catExtra */
  catList?: CatDef[]
  /** 改名／合併紀錄：`舊分類|舊子分類` 或 `舊分類|*` → `新分類|新子分類`（匯入舊資料時用） */
  catAlias?: Record<string, string>
  /** 分類資料版本：2＝已是 10 分類，之後不再套用舊名稱對照 */
  catVer?: number
  receivables: Receivable[]
  invSnapshots: InvSnapshot[]
  /** 記帳預設值（選填；舊資料沒有時一律用預設） */
  prefs?: Partial<EntryPrefs>
  /** 花費上限的進階設定（選填）：總上限、子分類上限、單月覆寫。各分類每月上限仍存在 budgets */
  budgetCfg?: BudgetCfg
  /** 三大類：子分類（`分類|子分類`）或整個分類（`分類|*`）歸到固定／變動支出；沒設定的用預設 */
  groupMap?: Record<string, Grp>
  updatedAt: number
}

export interface BudgetCfg {
  /** 每月總上限（0／未設＝不限） */
  total?: number
  /** 子分類上限，key＝`分類|子分類` */
  subs?: Record<string, number>
  /** 指定月份覆寫（YYYY-MM）；沒寫的欄位沿用每月預設 */
  overrides?: Record<string, { cats?: Record<string, number>; total?: number }>
  /** 三大類預算（與分類上限各自獨立）；saving 是每月儲蓄目標（未設＝15,000） */
  groups?: { fixed?: number; variable?: number; saving?: number }
  /** 每月收入估計（未設＝近 3 個月平均薪資） */
  incomeEst?: number
}

export type Grp = 'fixed' | 'variable'
export type GroupKey = Grp | 'saving'
export const GROUP_META: Record<GroupKey, { label: string; short: string; emoji: string; color: string }> = {
  fixed: { label: '固定支出', short: '固定', emoji: '📌', color: '#5E5CE6' },
  variable: { label: '變動支出', short: '變動', emoji: '🛒', color: '#FF9F0A' },
  saving: { label: '儲蓄', short: '儲蓄', emoji: '🐷', color: '#34C759' },
}
/** 預設歸為固定支出的子分類（其餘都是變動支出） */
export const DEFAULT_FIXED = ['居家生活|房租水電', '學習與3C|訂閱', '學習與3C|電話網路', '醫療保健|保險費', '交通|保險稅捐', '人情公益|孝養父母', '家庭|贊助']
export const DEFAULT_SAVING_TARGET = 15000

export type EntryMode = 'expense' | 'income' | 'transfer' | 'withdraw'
export interface EntryPrefs {
  defaultMode: EntryMode
  payId: string
  rememberLastPay: boolean
  lastPayId: string
  category: string
  sub: string
  /** 付款方式顯示成快捷按鈕的帳戶 */
  favAccounts: string[]
  /** 常用項目：`分類|子分類`，依順序顯示 */
  quickPicks: string[]
  transferFrom: string
  transferTo: string
  withdrawFrom: string
  withdrawTo: string
  incomeTo: string
  /** 收入預設分類／子分類（v2.8 新增；舊資料沒有時用 公司薪資） */
  incomeCat: string
  incomeSub: string
  /** 記住上次入帳帳戶 */
  rememberLastIncome: boolean
  lastIncomeTo: string
}

export interface CatDef {
  key: string
  emoji: string
  color: string
  subs: string[]
  /** 隱藏：不出現在記帳選單，但歷史與分析照常顯示 */
  hidden?: boolean
  hiddenSubs?: string[]
  /** 內建分類改名後記住原本的名字（恢復預設時不會再補一個） */
  origin?: string
  /** 使用者新增的分類（非內建） */
  custom?: boolean
}

/** 支出分類（10 類）：依 Morgen 舊 App（AndroMoney）分類與 527 筆實際紀錄精簡。
 *  理財投資刻意不列入：買 ETF／股票／定存屬於轉帳（或證券買進），不是消費。
 *  代墊款不再是分類：幫朋友付請用「分帳」（只算自己的份額）。 */
export const CATEGORIES: CatDef[] = [
  { key: '餐飲食品', emoji: '🍱', color: '#FF9F0A', subs: ['早餐', '午餐', '晚餐', '宵夜', '點心零嘴', '水果', '食材', '飲料', '下午茶'] },
  { key: '服飾美容', emoji: '👗', color: '#BF5AF2', subs: ['衣服', '鞋包配件', '保養品', '剪髮理容'] },
  { key: '居家生活', emoji: '🏠', color: '#30B0C7', subs: ['日用品', '網購', '居家雜務', '房租水電', '寵物', '雜支'] },
  { key: '交通', emoji: '🚌', color: '#0A84FF', subs: ['大眾運輸', '計程車', '高鐵火車', '飛機', '油錢', '停車過路', '維修保養', '保險稅捐', '租車'] },
  { key: '學習與3C', emoji: '📚', color: '#5E5CE6', subs: ['ai', '訂閱', '線上課程', '書', '文具', '3C設備', '電話網路'] },
  { key: '休閒娛樂', emoji: '🎈', color: '#FFB340', subs: ['電影', '娛樂購物', '小禮物', '公仔', '水晶', '其他'] },
  { key: '醫療保健', emoji: '🩺', color: '#FF3B30', subs: ['診所就醫', '購買藥物', '身體檢查', '保險費'] },
  { key: '人情公益', emoji: '🎁', color: '#FF375F', subs: ['送禮請客', '紅包', '婚喪喜慶', '孝養父母', '捐款', '拜拜'] },
  { key: '家庭', emoji: '👨‍👩‍👧', color: '#FF6482', subs: ['媽媽購物', '海象', '家', '慶生', '贊助'] },
  { key: '旅遊', emoji: '✈️', color: '#34C759', subs: ['交通', '住宿', '吃飯', '伴手禮', '景點'] },
]

/** 已停用、但舊紀錄仍可能使用的分類：不出現在選單／上限，歷史紀錄照常顯示與計算 */
export const LEGACY_CATEGORIES: CatDef[] = [
  { key: '代墊款', emoji: '🤝', color: '#AF52DE', subs: ['代墊款'] },
]

/** 快速記帳「常用項目」捷徑（依真實最高頻排序） */
export const QUICK_PICKS: { cat: string; sub: string; emoji: string }[] = [
  { cat: '餐飲食品', sub: '晚餐', emoji: '🍜' },
  { cat: '餐飲食品', sub: '飲料', emoji: '🧋' },
  { cat: '餐飲食品', sub: '早餐', emoji: '🥪' },
  { cat: '居家生活', sub: '居家雜務', emoji: '🧻' },
  { cat: '餐飲食品', sub: '下午茶', emoji: '🍰' },
  { cat: '家庭', sub: '媽媽購物', emoji: '👩' },
  { cat: '家庭', sub: '海象', emoji: '🦭' },
  { cat: '餐飲食品', sub: '午餐', emoji: '🍱' },
]

const CUSTOM_COLORS = ['#A2845E', '#4F7CAC', '#FFB340', '#8E8E93', '#00C7BE', '#FF8A65']

/** 合併內建分類與使用者自訂分類／子分類 */
export function expenseCats(extra?: { cats?: { key: string; emoji?: string }[]; subs?: Record<string, string[]> }, list?: CatDef[]): CatDef[] {
  if (list?.length) return list.map((c, i) => ({ ...c, color: c.color || CUSTOM_COLORS[i % CUSTOM_COLORS.length], subs: [...c.subs] }))
  const base = CATEGORIES.map((c) => ({ ...c, subs: [...c.subs, ...(extra?.subs?.[c.key] ?? []).filter((x) => !c.subs.includes(x))] }))
  const custom = (extra?.cats ?? [])
    .filter((c) => !CATEGORIES.some((b) => b.key === c.key))
    .map((c, i) => ({ key: c.key, emoji: c.emoji || '🏷️', color: CUSTOM_COLORS[i % CUSTOM_COLORS.length], subs: extra?.subs?.[c.key] ?? [], custom: true }))
  return [...base, ...custom]
}

export const INCOME_CATEGORIES: CatDef[] = [
  { key: '公司薪資', emoji: '💼', color: '#34C759', subs: [] },
  { key: '家教', emoji: '✏️', color: '#30B0C7', subs: [] },
  { key: '利息', emoji: '🏦', color: '#0A84FF', subs: [] },
  { key: '租屋補助', emoji: '🏘️', color: '#5E5CE6', subs: [] },
  { key: '投資配息/折讓/獲利', emoji: '📈', color: '#FF9F0A', subs: ['配息', '折讓款', '了結獲利'] },
  { key: '代墊款回收', emoji: '🤝', color: '#AF52DE', subs: ['朋友聚餐', '出去玩', '媽媽購物', '家庭', '其他'] },
  { key: '信用卡回饋', emoji: '💳', color: '#FF375F', subs: [] },
  { key: '退款/其他', emoji: '💰', color: '#8E8E93', subs: ['退款', '打工', '中獎', '其他'] },
]

export const TRANSFER_CATEGORIES: CatDef[] = [
  { key: '一般轉帳', emoji: '🔁', color: '#8E8E93', subs: [] },
  { key: '信用卡費', emoji: '💳', color: '#8E8E93', subs: [] },
  { key: '投資', emoji: '📈', color: '#8E8E93', subs: ['投入', '獲利了結', '配息再投入'] },
  { key: '領現', emoji: '🏧', color: '#8E8E93', subs: [] },
  { key: '收回代墊', emoji: '🤝', color: '#8E8E93', subs: [] },
  { key: '證券交易', emoji: '📊', color: '#8E8E93', subs: ['買進', '賣出'] },
]

/** 記帳選單用：去掉隱藏的分類與子分類 */
export const visibleCats = (cats: CatDef[]) => cats.filter((c) => !c.hidden).map((c) => ({ ...c, subs: c.subs.filter((x) => !c.hiddenSubs?.includes(x)) }))
export const CUSTOM_COLOR_LIST = CUSTOM_COLORS

let customRef: CatDef[] = []
export function setCustomCats(c: CatDef[]) {
  customRef = c
}
export function catMeta(key?: string): CatDef {
  return (
    customRef.find((c) => c.key === key) ??
    CATEGORIES.find((c) => c.key === key) ??
    LEGACY_CATEGORIES.find((c) => c.key === key) ??
    INCOME_CATEGORIES.find((c) => c.key === key) ??
    TRANSFER_CATEGORIES.find((c) => c.key === key) ?? { key: key ?? '其他', emoji: '🧩', color: '#8E8E93', subs: [] }
  )
}
