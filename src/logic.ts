import type { Account, AppState, BudgetCfg, Grp, EntryMode, EntryPrefs, Holding, InvSnapshot, Receivable, Tx, Recur, RecurFreq } from './types'
import { migrateCats } from './catmigrate'
import { DEFAULT_FIXED, DEFAULT_SAVING_TARGET, INCOME_CATEGORIES, QUICK_PICKS, catMeta, expenseCats, isFx } from './types'

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)

/** 以台北時區取得 YYYY-MM-DD */
export function todayStr(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}
export const monthOf = (date: string) => date.slice(0, 7)
export const thisMonth = () => monthOf(todayStr())

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}
export function monthLabel(month: string, short = false) {
  const [y, m] = month.split('-').map(Number)
  return short ? `${m}月` : `${y} 年 ${m} 月`
}
export function dateLabel(date: string) {
  const [y, m, d] = date.split('-').map(Number)
  const wd = ['日', '一', '二', '三', '四', '五', '六'][new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
  const today = todayStr()
  if (date === today) return `今天 · ${m}月${d}日 週${wd}`
  return `${m}月${d}日 週${wd}`
}

const nf = new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 0 })
export function money(n: number, hidden = false, opts: { sign?: boolean; prefix?: boolean } = {}) {
  const { sign = false, prefix = true } = opts
  if (hidden) return (prefix ? 'NT$ ' : '') + '••••'
  const r = Math.round(n)
  const s = nf.format(Math.abs(r))
  const sg = r < 0 ? '−' : sign && r > 0 ? '+' : ''
  return `${sg}${prefix ? 'NT$ ' : ''}${s}`
}
export const pct = (n: number, digits = 1) => `${n >= 0 ? '+' : ''}${(n * 100).toFixed(digits)}%`

export function fmtTaipei(ts: number) {
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(new Date(ts))
}

export const byId = (s: AppState, id?: string) => s.accounts.find((a) => a.id === id)
export const isCard = (a?: Account) => a?.kind === 'card'
export const cardDebt = (a: Account) => (a.billed ?? 0) + (a.unbilled ?? 0)

/** 將一筆交易套用到帳戶（sign=1 套用，-1 回補）。回傳新 accounts 與（套用時）卡費拆分 */
export function applyTx(accounts: Account[], tx: Tx, sign: 1 | -1): { accounts: Account[]; split?: Tx['split'] } {
  const accs = accounts.map((a) => ({ ...a }))
  const get = (id?: string) => accs.find((a) => a.id === id)
  const amt = tx.amount * sign
  let split: Tx['split']
  if (tx.type === 'expense') {
    const from = get(tx.fromId)
    if (from) {
      if (from.kind === 'card') from.unbilled = (from.unbilled ?? 0) + amt
      else if (from.kind === 'loan') from.balance += amt
      else from.balance -= amt
    }
  } else if (tx.type === 'income') {
    const to = get(tx.toId)
    if (to) to.balance += amt
  } else {
    const from = get(tx.fromId)
    const to = get(tx.toId)
    if (from) {
      if (from.kind === 'card') from.unbilled = (from.unbilled ?? 0) + amt // 預借現金
      else if (from.kind === 'loan') from.balance += amt
      else from.balance -= amt
    }
    if (to) {
      if (to.kind === 'card') {
        if (sign === 1) {
          const b = Math.min(to.billed ?? 0, tx.amount)
          const u = tx.amount - b
          to.billed = (to.billed ?? 0) - b
          to.unbilled = (to.unbilled ?? 0) - u
          split = { billed: b, unbilled: u }
        } else {
          const sp = tx.split ?? { billed: tx.amount, unbilled: 0 }
          to.billed = (to.billed ?? 0) + sp.billed
          to.unbilled = (to.unbilled ?? 0) + sp.unbilled
        }
      } else if (to.kind === 'loan') to.balance -= amt
      else to.balance += amt
    }
  }
  // 外幣帳戶：台幣約當變動時，依匯率同步原幣餘額
  for (const a of accs) {
    if (isFx(a) && (a.fxRate ?? 0) > 0 && (a.id === tx.fromId || a.id === tx.toId)) a.fxBalance = Math.round((a.balance / (a.fxRate as number)) * 100) / 100
  }
  return { accounts: accs, split }
}

/** 接受 v1 / v2 格式（舊版 localStorage、雲端、JSON 匯入檔） */
export function validState(x: unknown): x is AppState {
  const s = x as AppState
  const v = (s as { version?: number } | null)?.version
  return (
    !!s && (v === 1 || v === 2) && Array.isArray(s.accounts) && Array.isArray(s.txs) && Array.isArray(s.holdings) &&
    !!s.budgets && typeof s.budgets === 'object' && typeof s.updatedAt === 'number' &&
    s.accounts.every((a) => typeof a.id === 'string' && typeof a.name === 'string' && typeof a.balance === 'number')
  )
}

/** 舊版資料自動升級到 v2，不遺失任何欄位 */
export function migrate(input: AppState): AppState {
  const raw = input as AppState & { version: number }
  let s: AppState = {
    ...raw,
    version: 2,
    flow: raw.flow && typeof raw.flow === 'object' ? { month: raw.flow.month ?? thisMonth(), done: raw.flow.done ?? {} } : { month: thisMonth(), done: {} },
    receivables: Array.isArray(raw.receivables) ? raw.receivables : [],
    invSnapshots: Array.isArray(raw.invSnapshots) ? raw.invSnapshots : [],
  }
  if ((input as { version: number }).version === 1) {
    // v1：證券戶沒有本金紀錄 → 以既有持倉成本作為「追蹤前已投入本金」，交割現金從 0 起算
    s = {
      ...s,
      accounts: s.accounts.map((a) =>
        a.kind === 'broker' && a.principalBase === undefined
          ? { ...a, balance: 0, principalBase: Math.round(s.holdings.filter((h) => h.brokerId === a.id).reduce((x, h) => x + h.shares * h.cost, 0)) }
          : a,
      ),
    }
  }
  return migrateCats(s)
}

const r2 = (n: number) => Math.round(n * 100) / 100

/** 證券交易對持倉的影響（sign=-1 為回補） */
export function applyTrade(holdings: Holding[], tx: Tx, sign: 1 | -1): { holdings: Holding[]; trade?: Tx['trade'] } {
  const t = tx.trade
  if (!t || t.kind === 'dividend') return { holdings }
  const hs = holdings.map((h) => ({ ...h }))
  const id = `${t.brokerId}-${t.symbol}`
  let h = hs.find((x) => x.brokerId === t.brokerId && x.symbol === t.symbol)
  let trade = t
  if (t.kind === 'buy') {
    const gross = t.shares * t.price + t.fee
    if (sign === 1) {
      if (!h) {
        h = { id, brokerId: t.brokerId, symbol: t.symbol, name: t.name, shares: 0, cost: 0, price: t.price }
        hs.push(h)
      }
      const total = h.shares * h.cost + gross
      h.shares = r2(h.shares + t.shares)
      h.cost = h.shares ? r2(total / h.shares) : 0
      if (!h.price) h.price = t.price
    } else if (h) {
      const left = r2(h.shares - t.shares)
      if (left <= 0) return { holdings: hs.filter((x) => x !== h) }
      h.cost = r2((h.shares * h.cost - gross) / left)
      h.shares = left
    }
  } else {
    if (sign === 1) {
      if (!h) return { holdings: hs, trade }
      trade = { ...t, costAtSell: h.cost }
      h.shares = r2(h.shares - t.shares)
      if (h.shares <= 0) return { holdings: hs.filter((x) => x !== h), trade }
    } else {
      if (!h) {
        h = { id, brokerId: t.brokerId, symbol: t.symbol, name: t.name, shares: 0, cost: t.costAtSell ?? t.price, price: t.price }
        hs.push(h)
      }
      h.shares = r2(h.shares + t.shares)
    }
  }
  return { holdings: hs, trade }
}

/** 一筆交易對整體狀態（帳戶、持倉、待收代墊）的影響；不動 txs 陣列 */
export function applyFull(s: AppState, tx: Tx, sign: 1 | -1): { state: AppState; tx: Tx } {
  const r = applyTx(s.accounts, tx, sign)
  const tr = applyTrade(s.holdings, tx, sign)
  let receivables = s.receivables
  if (tx.share && tx.share.parts.length) {
    if (sign === 1) {
      receivables = [
        ...receivables,
        ...tx.share.parts.filter((p) => p.amount > 0).map((p, i) => ({ id: `${tx.id}-r${i}`, txId: tx.id, friend: p.name || '朋友', amount: p.amount, date: tx.date, note: tx.note || tx.sub || tx.category })),
      ]
    } else receivables = receivables.filter((x) => x.txId !== tx.id)
  }
  if (tx.tag === 'collect' && tx.receivableIds?.length) {
    const ids = new Set(tx.receivableIds)
    receivables = receivables.map((x) => (ids.has(x.id) ? { ...x, collectedBy: sign === 1 ? tx.id : undefined } : x))
  }
  const nextTx = sign === 1 ? { ...tx, split: r.split ?? tx.split, trade: tr.trade ?? tx.trade } : tx
  return { state: { ...s, accounts: r.accounts, holdings: tr.holdings, receivables }, tx: nextTx }
}

/** 分帳支出計入「我的份額」；其他支出為全額 */
export const myAmount = (t: Tx) => (t.type === 'expense' && t.share ? t.share.mine : t.amount)

export const outstanding = (s: AppState) => s.receivables.filter((r) => !r.collectedBy)

export function totals(s: AppState) {
  const liquidAccs = s.accounts.filter((a) => a.kind === 'bank' || a.kind === 'cash')
  const liquid = liquidAccs.reduce((x, a) => x + a.balance, 0)
  const fx = liquidAccs.filter(isFx).reduce((x, a) => x + a.balance, 0)
  const brokerCash = s.accounts.filter((a) => a.kind === 'broker').reduce((x, a) => x + a.balance, 0)
  const holdingsMV = s.holdings.reduce((x, h) => x + h.shares * h.price, 0)
  const invest = holdingsMV + brokerCash
  const receivable = outstanding(s).reduce((x, r) => x + r.amount, 0)
  const investCost = s.holdings.reduce((x, h) => x + h.shares * h.cost, 0)
  const cards = s.accounts.filter((a) => a.kind === 'card').reduce((x, a) => x + cardDebt(a), 0)
  const loans = s.accounts.filter((a) => a.kind === 'loan').reduce((x, a) => x + a.balance, 0)
  return { liquid, fx, twd: liquid - fx, invest, holdingsMV, brokerCash, receivable, investCost, debt: cards + loans, cards, loans, net: liquid + invest + receivable - cards - loans }
}

export type StatMode = 'spend' | 'cash'

/** 信用卡帳單：交易日所屬的結帳日（YYYY-MM-DD） */
export function closingFor(date: string, statementDay = 5): string {
  const [y, m] = date.split('-').map(Number)
  const clamp = (yy: number, mm: number) => {
    const last = new Date(Date.UTC(yy, mm, 0)).getUTCDate()
    return `${yy}-${String(mm).padStart(2, '0')}-${String(Math.min(statementDay, last)).padStart(2, '0')}`
  }
  const thisClose = clamp(y, m)
  if (date <= thisClose) return thisClose
  const nm = shiftMonth(`${y}-${String(m).padStart(2, '0')}`, 1).split('-').map(Number)
  return clamp(nm[0], nm[1])
}
/** 結帳日 → 扣款日 */
export function dueFor(closing: string, statementDay = 5, dueDay = 20): string {
  const ym = closing.slice(0, 7)
  const target = dueDay > statementDay ? ym : shiftMonth(ym, 1)
  const [y, m] = target.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return `${target}-${String(Math.min(dueDay, last)).padStart(2, '0')}`
}
export function prevClosing(closing: string, statementDay = 5) {
  const [y, m] = shiftMonth(closing.slice(0, 7), -1).split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return `${y}-${String(m).padStart(2, '0')}-${String(Math.min(statementDay, last)).padStart(2, '0')}`
}

/** 交易在「實際扣款（現金流）」視角下落在哪個月 */
export function cashMonthOf(t: Tx, accounts: Account[]): string {
  const a = t.type === 'expense' ? accounts.find((x) => x.id === t.fromId) : undefined
  if (a?.kind === 'card') return monthOf(dueFor(closingFor(t.date, a.statementDay), a.statementDay, a.dueDay))
  return monthOf(t.date)
}

export function monthStats(s: AppState, month: string, mode: StatMode = 'spend') {
  let income = 0
  let expense = 0
  let card = 0
  const byCat: Record<string, number> = {}
  for (const t of s.txs) {
    if (t.type === 'income') {
      if (monthOf(t.date) === month) income += t.amount
    } else if (t.type === 'expense') {
      const m = mode === 'cash' ? cashMonthOf(t, s.accounts) : monthOf(t.date)
      if (m !== month) continue
      const amt = myAmount(t)
      expense += amt
      if (s.accounts.find((a) => a.id === t.fromId)?.kind === 'card') card += amt
      const k = t.category ?? '其他'
      byCat[k] = (byCat[k] ?? 0) + amt
    }
  }
  return { income, expense, card, net: income - expense, byCat }
}

export interface Statement {
  closing: string
  start: string
  due: string
  txs: Tx[]
  total: number
}
/** 某張卡的帳單期（未出帳、本期、上期…） */
export function cardStatements(s: AppState, card: Account, count = 3): Statement[] {
  const S = card.statementDay ?? 5
  const D = card.dueDay ?? 20
  let closing = closingFor(todayStr(), S)
  const out: Statement[] = []
  for (let i = 0; i < count; i++) {
    const prev = prevClosing(closing, S)
    const txs = s.txs.filter((t) => t.type === 'expense' && t.fromId === card.id && t.date > prev && t.date <= closing)
    const [y, m, d] = prev.split('-').map(Number)
    const st = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10)
    out.push({ closing, start: st, due: dueFor(closing, S, D), txs, total: txs.reduce((x, t) => x + t.amount, 0) })
    closing = prev
  }
  return out
}

/** 今天或已過扣款日、仍有應繳的卡 */
export function dueCards(s: AppState) {
  const today = todayStr()
  const day = Number(today.slice(8, 10))
  return s.accounts
    .filter((a) => a.kind === 'card' && (a.billed ?? 0) > 0 && (a.dueDay ?? 99) <= day)
    .map((a) => ({ card: a, today: a.dueDay === day }))
}

/** 證券戶統計 */
export function brokerStats(s: AppState, brokerId?: string) {
  const brokers = s.accounts.filter((a) => a.kind === 'broker' && (!brokerId || a.id === brokerId))
  const ids = new Set(brokers.map((b) => b.id))
  let principal = brokers.reduce((x, b) => x + (b.principalBase ?? 0), 0)
  let dividends = 0
  let realized = 0
  const realizedBy: Record<string, number> = {}
  const byYear: Record<string, { realized: number; dividends: number }> = {}
  const monthIn: Record<string, number> = {}
  for (const t of s.txs) {
    if (t.type === 'transfer' && !t.trade) {
      if (t.toId && ids.has(t.toId) && !(t.fromId && ids.has(t.fromId))) {
        principal += t.amount
        monthIn[monthOf(t.date)] = (monthIn[monthOf(t.date)] ?? 0) + t.amount
      }
      if (t.fromId && ids.has(t.fromId) && !(t.toId && ids.has(t.toId))) principal -= t.amount
    }
    if (t.trade && ids.has(t.trade.brokerId)) {
      const yr = t.date.slice(0, 4)
      byYear[yr] ??= { realized: 0, dividends: 0 }
      if (t.trade.kind === 'dividend') { dividends += t.amount; byYear[yr].dividends += t.amount }
      if (t.trade.kind === 'sell' && t.trade.costAtSell !== undefined) {
        const pl = t.trade.shares * (t.trade.price - t.trade.costAtSell) - t.trade.fee
        realized += pl
        byYear[yr].realized += pl
        const sk = t.trade.strategy ?? 'none'
        realizedBy[sk] = (realizedBy[sk] ?? 0) + pl
      }
    }
  }
  const hs = s.holdings.filter((h) => ids.has(h.brokerId))
  const mv = hs.reduce((x, h) => x + h.shares * h.price, 0)
  const cost = hs.reduce((x, h) => x + h.shares * h.cost, 0)
  const cash = brokers.reduce((x, b) => x + b.balance, 0)
  const value = mv + cash
  const years = Object.entries(byYear).sort((a, b) => b[0].localeCompare(a[0])).map(([year, v]) => ({ year, ...v }))
  return { principal, mv, cost, cash, value, unrealized: mv - cost, gain: value - principal, ret: principal ? value / principal - 1 : 0, dividends, realized, realizedBy, years, monthIn }
}

export function upsertSnapshot(s: AppState): InvSnapshot[] {
  const st = brokerStats(s)
  const m = thisMonth()
  const snap = { month: m, principal: Math.round(st.principal), value: Math.round(st.value) }
  return [...s.invSnapshots.filter((x) => x.month !== m), snap].sort((a, b) => (a.month < b.month ? -1 : 1)).slice(-36)
}

export function friendsOwed(s: AppState) {
  const m = new Map<string, { friend: string; amount: number; items: Receivable[] }>()
  for (const r of outstanding(s)) {
    const f = m.get(r.friend) ?? { friend: r.friend, amount: 0, items: [] }
    f.amount += r.amount
    f.items.push(r)
    m.set(r.friend, f)
  }
  return [...m.values()].sort((a, b) => b.amount - a.amount)
}

/** 主要現金錢包（每月領現目標的那個；LINE PAY MONEY 等電子錢包不算） */
export function cashWallet(accounts: Account[]) {
  return accounts.find((a) => a.id === 'cash') ?? accounts.find((a) => a.kind === 'cash' && (a.cashTarget ?? 0) > 0) ?? accounts.find((a) => a.kind === 'cash')
}

export function projectList(s: AppState) {
  const m = new Map<string, { project: string; expense: number; income: number; count: number; first: string; last: string; byCat: Record<string, number> }>()
  for (const t of s.txs) {
    if (!t.project) continue
    const p = m.get(t.project) ?? { project: t.project, expense: 0, income: 0, count: 0, first: t.date, last: t.date, byCat: {} }
    p.count++
    if (t.type === 'expense') {
      p.expense += myAmount(t)
      const k = t.category ?? '其他'
      p.byCat[k] = (p.byCat[k] ?? 0) + myAmount(t)
    }
    if (t.type === 'income') p.income += t.amount
    if (t.date < p.first) p.first = t.date
    if (t.date > p.last) p.last = t.date
    m.set(t.project, p)
  }
  return [...m.values()].sort((a, b) => (a.last < b.last ? 1 : -1))
}

export function cashWithdrawn(s: AppState, month: string) {
  const cash = cashWallet(s.accounts)
  return s.txs
    .filter((t) => t.type === 'transfer' && t.toId === cash?.id && monthOf(t.date) === month)
    .reduce((x, t) => x + t.amount, 0)
}

export function etfInvested(s: AppState, month: string, brokerId?: string) {
  return s.txs
    .filter((t) => monthOf(t.date) === month && t.type === 'transfer' && !t.trade && (brokerId ? t.toId === brokerId : t.tag === 'etf'))
    .reduce((x, t) => x + t.amount, 0)
}

/** 過去 n 個月月底淨資產（以收支回推；轉帳不影響淨資產） */
export function netWorthHistory(s: AppState, n = 6) {
  const cur = thisMonth()
  const nowNet = totals(s).net
  const out: { month: string; net: number; income: number; expense: number }[] = []
  for (let i = n - 1; i >= 0; i--) {
    const m = shiftMonth(cur, -i)
    let after = 0
    for (const t of s.txs) {
      if (monthOf(t.date) > m) after += t.type === 'income' ? t.amount : t.type === 'expense' ? -myAmount(t) : 0
    }
    const st = monthStats(s, m)
    out.push({ month: m, net: nowNet - after, income: st.income, expense: st.expense })
  }
  return out
}

export function txAccountsLabel(s: AppState, t: Tx) {
  const f = byId(s, t.fromId)?.name
  const to = byId(s, t.toId)?.name
  if (t.type === 'expense') return f ?? '—'
  if (t.type === 'income') return to ?? '—'
  if (t.tag === 'collect') return `待收代墊 → ${to ?? '—'}`
  if (t.trade) return byId(s, t.trade.brokerId)?.name ?? '—'
  return `${f ?? '—'} → ${to ?? '—'}`
}

/** 本月資金流向（Sankey 用）：收入 → 帳戶 → 帳戶 → 信用卡／消費／投資 */
export function monthFlows(s: AppState, month: string, end?: string) {
  const inRange = (d: string) => (end ? d >= month && d <= end : monthOf(d) === month)
  const links = new Map<string, number>()
  const add = (a: string | undefined, b: string | undefined, v: number) => {
    if (!a || !b || a === b || v <= 0) return
    const k = `${a}|${b}`
    links.set(k, (links.get(k) ?? 0) + v)
  }
  for (const t of s.txs) {
    if (!inRange(t.date)) continue
    if (t.type === 'income') add(t.trade ? 'src:div' : 'src:income', t.toId, t.amount)
    else if (t.type === 'expense') {
      add(t.fromId, 'sink:spend', myAmount(t))
      if (t.share) add(t.fromId, 'sink:recv', t.amount - t.share.mine)
    } else if (t.tag === 'collect') add('src:recv', t.toId, t.amount)
    else if (t.trade?.kind === 'buy') add(t.fromId, 'sink:hold', t.amount)
    else if (t.trade?.kind === 'sell') add('src:hold', t.toId, t.amount)
    else add(t.fromId, t.toId, t.amount)
  }
  const used = new Set([...links.keys()].flatMap((k) => k.split('|')))
  const special: Record<string, [string, string]> = {
    'src:income': ['薪資與收入', '#34C759'], 'src:div': ['配息', '#30D158'], 'src:recv': ['代墊收回', '#AF52DE'], 'src:hold': ['賣出持股', '#FF9F0A'],
    'sink:spend': ['實際消費', '#FF9F0A'], 'sink:recv': ['新增待收代墊', '#AF52DE'], 'sink:hold': ['買進 ETF／股票', '#34C759'],
  }
  const nodes = [...used].map((id) => {
    const sp = special[id]
    const a = s.accounts.find((x) => x.id === id)
    return { id, label: sp ? sp[0] : a?.name ?? id, color: sp ? sp[1] : a?.color ?? '#8E8E93' }
  })
  const order = (id: string) => (id.startsWith('src:') ? 0 : id.startsWith('sink:') ? 9 : 1 + s.accounts.findIndex((a) => a.id === id) / 100)
  nodes.sort((a, b) => order(a.id) - order(b.id))
  return { nodes, links: [...links.entries()].map(([k, value]) => { const [source, target] = k.split('|'); return { source, target, value } }) }
}

/* ---------------- 多維度分析 ---------------- */
export type TxKind = 'all' | 'expense' | 'income' | 'transfer'

/** 支出在「實際扣款」模式下的日期：信用卡 → 該期帳單扣款日 */
export function cashDateOf(t: Tx, accounts: Account[]): string {
  const a = t.type === 'expense' ? accounts.find((x) => x.id === t.fromId) : undefined
  if (a?.kind === 'card') return dueFor(closingFor(t.date, a.statementDay), a.statementDay, a.dueDay)
  return t.date
}

export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000) + 1

export interface Bucket { key: string; label: string; expense: number; income: number; invest: number }
export interface PairRow { from: string; to: string; amount: number; count: number }

/** 任意區間統計：支出（只算自己的份額，可切刷卡日／扣款日）、收入、轉帳（另計，不算收支） */
export function rangeStats(s: AppState, start: string, end: string, mode: StatMode = 'spend') {
  const byDay = daysBetween(start, end) <= 62
  const buckets = new Map<string, Bucket>()
  // 先建立完整的時間軸
  if (byDay) {
    for (let i = 0, d = start; d <= end && i < 400; i++) {
      buckets.set(d, { key: d, label: `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`, expense: 0, income: 0, invest: 0 })
      const [y, m, dd] = d.split('-').map(Number)
      d = new Date(Date.UTC(y, m - 1, dd + 1)).toISOString().slice(0, 10)
    }
  } else {
    for (let m = monthOf(start), i = 0; m <= monthOf(end) && i < 120; m = shiftMonth(m, 1), i++)
      buckets.set(m, { key: m, label: `${Number(m.slice(5))}月`, expense: 0, income: 0, invest: 0 })
  }
  const bucketOf = (d: string) => buckets.get(byDay ? d : monthOf(d))
  const expCat: Record<string, number> = {}
  const incCat: Record<string, number> = {}
  const trCat: Record<string, number> = {}
  const pairs = new Map<string, PairRow>()
  const grpCat: Record<Grp, Record<string, number>> = { fixed: {}, variable: {} }
  const grp: Record<Grp, number> = { fixed: 0, variable: 0 }
  const tot = { expense: 0, income: 0, transfer: 0, invest: 0, card: 0, shared: 0, nExp: 0, nInc: 0, nTr: 0 }
  const name = (id?: string, t?: Tx) => s.accounts.find((a) => a.id === id)?.name ?? (t?.tag === 'collect' ? '朋友還款' : t?.trade ? '持股' : '—')
  for (const t of s.txs) {
    if (t.type === 'expense') {
      const d = mode === 'cash' ? cashDateOf(t, s.accounts) : t.date
      if (d < start || d > end) continue
      const amt = myAmount(t)
      tot.expense += amt
      tot.nExp++
      if (t.share) tot.shared += t.amount - t.share.mine
      if (s.accounts.find((a) => a.id === t.fromId)?.kind === 'card') tot.card += amt
      const k = t.category ?? '其他'
      expCat[k] = (expCat[k] ?? 0) + amt
      const g = groupOf(s.groupMap, k, t.sub)
      grp[g] += amt
      grpCat[g][k] = (grpCat[g][k] ?? 0) + amt
      const b = bucketOf(d)
      if (b) b.expense += amt
    } else {
      if (t.date < start || t.date > end) continue
      const b = bucketOf(t.date)
      if (t.type === 'income') {
        tot.income += t.amount
        tot.nInc++
        const k = t.category ?? '其他收入'
        incCat[k] = (incCat[k] ?? 0) + t.amount
        if (b) b.income += t.amount
      } else {
        tot.transfer += t.amount
        tot.nTr++
        const k = t.trade ? `證券${t.trade.kind === 'buy' ? '買進' : '賣出'}` : t.category ?? '一般轉帳'
        trCat[k] = (trCat[k] ?? 0) + t.amount
        // 投資：入金到證券戶或儲蓄帳戶（非證券交易），不算支出
        if (!t.trade && isSavingAcc(s.accounts.find((a) => a.id === t.toId)) && !isSavingAcc(s.accounts.find((a) => a.id === t.fromId))) {
          tot.invest += t.amount
          if (b) b.invest += t.amount
        }
        const f = t.trade?.kind === 'sell' ? '持股' : name(t.fromId, t)
        const to = t.trade?.kind === 'buy' ? `持股 ${t.trade.symbol}` : name(t.toId)
        const key = `${f}→${to}`
        const row = pairs.get(key) ?? { from: f, to, amount: 0, count: 0 }
        row.amount += t.amount
        row.count++
        pairs.set(key, row)
      }
    }
  }
  const rank = (o: Record<string, number>) => Object.entries(o).map(([key, value]) => ({ key, value })).sort((a, b) => b.value - a.value)
  return {
    ...tot,
    net: tot.income - tot.expense,
    byDay,
    days: daysBetween(start, end),
    series: [...buckets.values()],
    expCats: rank(expCat),
    incCats: rank(incCat),
    trCats: rank(trCat),
    pairs: [...pairs.values()].sort((a, b) => b.amount - a.amount),
    fixed: grp.fixed,
    variable: grp.variable,
    groupCats: { fixed: rank(grpCat.fixed), variable: rank(grpCat.variable) },
    saving: savingsIn(s, start, end),
  }
}

/* ---------------- 三大類：固定支出／變動支出／儲蓄 ---------------- */
/** 一筆支出屬於固定或變動：子分類設定 > 預設固定清單 > 分類設定（`分類|*`）> 變動 */
export function groupOf(map: Record<string, Grp> | undefined, cat?: string, sub?: string): Grp {
  const m = map ?? {}
  const c = cat ?? '其他'
  if (sub) {
    const k = `${c}|${sub}`
    if (m[k]) return m[k]
    if (DEFAULT_FIXED.includes(k)) return 'fixed'
  }
  return m[`${c}|*`] ?? 'variable'
}
export const isSavingAcc = (a?: Account) => !!a && (a.kind === 'broker' || !!a.savings)

/** 區間儲蓄：轉入證券戶（入金）或儲蓄帳戶的錢；從這些帳戶轉出到一般帳戶則扣回。
 *  證券買進／賣出是證券戶內部的動作（入金已算過），不重複計算；儲蓄從不算支出。 */
export function savingsIn(s: AppState, start: string, end: string) {
  const acc = (id?: string) => s.accounts.find((a) => a.id === id)
  let deposit = 0
  let withdraw = 0
  const byAcc: Record<string, number> = {}
  for (const t of s.txs) {
    if (t.type !== 'transfer' || t.trade || t.date < start || t.date > end) continue
    const fIn = isSavingAcc(acc(t.fromId)), tIn = isSavingAcc(acc(t.toId))
    if (tIn && !fIn) {
      deposit += t.amount
      const n = acc(t.toId)?.name ?? '儲蓄'
      byAcc[n] = (byAcc[n] ?? 0) + t.amount
    } else if (fIn && !tIn) withdraw += t.amount
  }
  return { deposit, withdraw, net: deposit - withdraw, byAcc: Object.entries(byAcc).map(([key, value]) => ({ key, value })).sort((a, b) => b.value - a.value) }
}

export const lastDayOfMonth = (m: string) => `${m}-${String(new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).getUTCDate()).padStart(2, '0')}`

/** 某月三大類預算狀態（預設依刷卡日；分帳只算自己的份額） */
export function groupStatus(s: AppState, month: string, mode: StatMode = 'spend') {
  const R = rangeStats(s, `${month}-01`, lastDayOfMonth(month), mode)
  const g = s.budgetCfg?.groups ?? {}
  const row = (key: Grp, sp: number, limit: number) => ({ key, spent: sp, limit, remain: limit - sp, ratio: limit ? sp / limit : 0, level: budgetLevel(sp, limit) })
  const target = g.saving ?? DEFAULT_SAVING_TARGET
  return {
    fixed: row('fixed', R.fixed, g.fixed ?? 0),
    variable: row('variable', R.variable, g.variable ?? 0),
    saving: { saved: R.saving.net, deposit: R.saving.deposit, withdraw: R.saving.withdraw, target, remain: target - R.saving.net, ratio: target ? Math.max(0, R.saving.net) / target : 0 },
    groupCats: R.groupCats,
  }
}

/** 分類上限換算到三大類（提示用）：一個分類的上限，依近 3 個月該分類固定／變動的實際比例拆開；
 *  沒有紀錄就整筆算在分類的預設歸屬。子分類上限另外設的，不重複加。 */
export function groupLimitHints(s: AppState, month: string) {
  const L = budgetLimits(s, month)
  const h: Record<Grp, number> = { fixed: 0, variable: 0 }
  const share: Record<string, { fixed: number; variable: number }> = {}
  for (let i = 1; i <= 3; i++) {
    const m = shiftMonth(month, -i)
    const R = rangeStats(s, `${m}-01`, lastDayOfMonth(m))
    for (const g of ['fixed', 'variable'] as Grp[]) for (const r of R.groupCats[g]) (share[r.key] ??= { fixed: 0, variable: 0 })[g] += r.value
  }
  for (const [c, v] of Object.entries(L.cats)) {
    const sh = share[c]
    const tot = sh ? sh.fixed + sh.variable : 0
    if (!tot) { h[groupOf(s.groupMap, c)] += v; continue }
    const f = Math.round((v * sh.fixed) / tot)
    h.fixed += f
    h.variable += v - f
  }
  return h
}

/** 近 3 個完整月份的平均實際花費（固定／變動），規劃預算用 */
export function groupAverages(s: AppState, n = 3) {
  const cur = thisMonth()
  const out: Record<Grp, number> & { saving: number } = { fixed: 0, variable: 0, saving: 0 }
  for (let i = 1; i <= n; i++) {
    const m = shiftMonth(cur, -i)
    const R = rangeStats(s, `${m}-01`, lastDayOfMonth(m))
    out.fixed += R.fixed / n
    out.variable += R.variable / n
    out.saving += R.saving.net / n
  }
  return { fixed: Math.round(out.fixed), variable: Math.round(out.variable), saving: Math.round(out.saving) }
}

/** 每月收入估計：手動設定 > 近 3 個完整月份平均薪資（公司薪資、不含獎金子分類）> 近 3 個月平均總收入 */
export function incomeEstimate(s: AppState) {
  const manual = s.budgetCfg?.incomeEst ?? 0
  const cur = thisMonth()
  const months = [1, 2, 3].map((i) => shiftMonth(cur, -i))
  let sal = 0, all = 0
  for (const t of s.txs) {
    if (t.type !== 'income' || !months.includes(monthOf(t.date))) continue
    all += t.amount
    if (t.category === '公司薪資' && !t.sub) sal += t.amount
  }
  const auto = Math.round((sal || all) / 3)
  return { value: manual > 0 ? manual : auto, manual: manual > 0, auto, basis: sal ? '近 3 個月平均薪資' : '近 3 個月平均收入' }
}

/* ---------------- 記帳預設值 ---------------- */
const QUICK_EMOJI: Record<string, string> = Object.fromEntries(QUICK_PICKS.map((q) => [`${q.cat}|${q.sub}`, q.emoji]))
export const quickKey = (cat: string, sub: string) => `${cat}|${sub}`
export function quickPickOf(key: string) {
  const [cat, sub = ''] = key.split('|')
  return { key, cat, sub, emoji: QUICK_EMOJI[key] ?? catMeta(cat).emoji, label: sub || cat }
}

/** 把存下來的偏好補齊；帳戶被刪掉或舊資料沒有欄位時，自動退回合理預設 */
export function resolvePrefs(s: AppState): EntryPrefs {
  const p = s.prefs ?? {}
  const accs = s.accounts
  const has = (id?: string, ok: (a: Account) => boolean = () => true) => !!id && accs.some((a) => a.id === id && ok(a))
  const pick = (cands: (string | undefined)[], ok?: (a: Account) => boolean) => cands.find((id) => has(id, ok)) ?? accs.find((a) => !ok || ok(a))?.id ?? ''
  const isCash = (a: Account) => a.kind === 'cash'
  const isBank = (a: Account) => a.kind === 'bank'
  const spendable = (a: Account) => a.kind === 'card' || a.kind === 'cash' || a.kind === 'bank'
  const cash = cashWallet(accs)
  const primary = accs.filter((a) => a.kind === 'card' && a.primary).map((a) => a.id)
  const modes: EntryMode[] = ['expense', 'income', 'transfer', 'withdraw']
  const payId = pick([p.payId, primary[0], cash?.id], spendable)
  const fav = (p.favAccounts ?? primary).filter((id) => has(id, spendable))
  const category = p.category && expenseCats(s.catExtra, s.catList).some((c) => c.key === p.category) ? p.category : '餐飲食品'
  const incDef = INCOME_CATEGORIES.find((c) => c.key === p.incomeCat)
  const incomeOk = (a: Account) => isBank(a) || isCash(a)
  const qp = (p.quickPicks ?? QUICK_PICKS.map((q) => quickKey(q.cat, q.sub))).filter((k) => typeof k === 'string' && k.includes('|'))
  return {
    defaultMode: modes.includes(p.defaultMode as EntryMode) ? (p.defaultMode as EntryMode) : 'expense',
    payId,
    rememberLastPay: !!p.rememberLastPay,
    lastPayId: has(p.lastPayId, spendable) ? p.lastPayId! : '',
    category,
    sub: category === p.category ? p.sub ?? '' : '',
    favAccounts: fav,
    quickPicks: qp,
    transferFrom: pick([p.transferFrom, 'mega'], (a) => a.kind !== 'card' && a.kind !== 'loan'),
    transferTo: pick([p.transferTo, 'richart'], (a) => a.id !== (p.transferFrom ?? 'mega')),
    withdrawFrom: pick([p.withdrawFrom, 'richart'], isBank),
    withdrawTo: pick([p.withdrawTo, cash?.id], isCash),
    incomeTo: pick([p.incomeTo, 'mega'], incomeOk),
    incomeCat: incDef?.key ?? '公司薪資',
    incomeSub: incDef && p.incomeSub && incDef.subs.includes(p.incomeSub) ? p.incomeSub : '',
    rememberLastIncome: !!p.rememberLastIncome,
    lastIncomeTo: has(p.lastIncomeTo, incomeOk) ? p.lastIncomeTo! : '',
  }
}
/** 新增支出時的付款方式：記住上次 → 上次；否則固定預設 */
export const defaultPayId = (p: EntryPrefs) => (p.rememberLastPay && p.lastPayId ? p.lastPayId : p.payId)
/** 新增收入時的入帳帳戶：記住上次 → 上次；否則固定預設 */
export const defaultIncomeTo = (p: EntryPrefs) => (p.rememberLastIncome && p.lastIncomeTo ? p.lastIncomeTo : p.incomeTo)
/** 切到某分頁時的預設子分類 */
export const defaultSubFor = (p: EntryPrefs, mode: EntryMode, expCat: string, incCat: string) =>
  mode === 'expense' ? (expCat === p.category ? p.sub : '') : mode === 'income' ? (incCat === p.incomeCat ? p.incomeSub : '') : ''

/* ---------------- 每月花費上限 ---------------- */
export type BudgetLevel = 'none' | 'ok' | 'warn' | 'over'
export const budgetLevel = (spent: number, limit: number): BudgetLevel => (!limit ? 'none' : spent > limit ? 'over' : spent >= limit * 0.8 ? 'warn' : 'ok')

/** 某月實際生效的上限（單月覆寫 > 每月預設；0＝不限） */
export function budgetLimits(s: AppState, month: string) {
  const cfg: BudgetCfg = s.budgetCfg ?? {}
  const o = cfg.overrides?.[month]
  const cats: Record<string, number> = {}
  for (const [k, v] of Object.entries(s.budgets ?? {})) if (v > 0) cats[k] = v
  for (const [k, v] of Object.entries(o?.cats ?? {})) { if (v > 0) cats[k] = v; else delete cats[k] }
  const total = o?.total !== undefined ? o.total : cfg.total ?? 0
  return { cats, total: total > 0 ? total : 0, subs: cfg.subs ?? {}, overridden: !!o && (Object.keys(o.cats ?? {}).length > 0 || o.total !== undefined) }
}

/** 某月預算狀態：只算支出（刷卡日）、分帳只算自己的份額；轉帳、投資不計 */
export function budgetStatus(s: AppState, month: string, extra?: { category: string; sub?: string; amount: number }) {
  const L = budgetLimits(s, month)
  const byCat: Record<string, number> = {}
  const bySub: Record<string, number> = {}
  let spent = 0
  for (const t of s.txs) {
    if (t.type !== 'expense' || monthOf(t.date) !== month) continue
    const a = myAmount(t)
    const c = t.category ?? '其他'
    byCat[c] = (byCat[c] ?? 0) + a
    if (t.sub) bySub[`${c}|${t.sub}`] = (bySub[`${c}|${t.sub}`] ?? 0) + a
    spent += a
  }
  if (extra) {
    byCat[extra.category] = (byCat[extra.category] ?? 0) + extra.amount
    if (extra.sub) bySub[`${extra.category}|${extra.sub}`] = (bySub[`${extra.category}|${extra.sub}`] ?? 0) + extra.amount
    spent += extra.amount
  }
  const row = (key: string, sp: number, limit: number) => ({ key, spent: sp, limit, remain: limit - sp, ratio: limit ? sp / limit : 0, level: budgetLevel(sp, limit) })
  const cats = expenseCats(s.catExtra, s.catList).map((c) => row(c.key, byCat[c.key] ?? 0, L.cats[c.key] ?? 0))
  const subs = Object.entries(L.subs).filter(([, v]) => v > 0).map(([k, v]) => row(k, bySub[k] ?? 0, v))
  const catSum = Object.values(L.cats).reduce((x, y) => x + y, 0)
  const totalLimit = L.total || catSum
  const today = todayStr()
  const [y, m] = month.split('-').map(Number)
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const cur = thisMonth()
  const daysLeft = month === cur ? dim - Number(today.slice(8, 10)) + 1 : month > cur ? dim : 0
  const remain = totalLimit - spent
  return {
    month, cats, subs, spent,
    total: { ...row('總計', spent, totalLimit), explicit: L.total > 0 },
    daysLeft,
    perDay: daysLeft > 0 && totalLimit ? Math.max(0, Math.floor(remain / daysLeft)) : null,
    overridden: L.overridden,
  }
}

/** 記一筆支出後要不要提醒（跨過 80%／100%） */
export function budgetAlert(s: AppState, tx: { category?: string; sub?: string; amount: number; date: string }) {
  if (!tx.category) return ''
  const m = monthOf(tx.date)
  const before = budgetStatus(s, m)
  const after = budgetStatus(s, m, { category: tx.category, sub: tx.sub, amount: tx.amount })
  const pickRow = (st: typeof before, key: string, sub?: boolean) => (sub ? st.subs : st.cats).find((r) => r.key === key)
  const check = (key: string, label: string, sub?: boolean) => {
    const a = pickRow(after, key, sub), b = pickRow(before, key, sub)
    if (!a || !a.limit) return ''
    if (a.level === 'over') return `⚠️ ${label} 已超支 ${money(-a.remain)}`
    if (a.level === 'warn' && b?.level !== 'warn') return `${label} 已用 ${Math.round(a.ratio * 100)}%，剩 ${money(a.remain)}`
    return ''
  }
  return check(`${tx.category}|${tx.sub ?? ''}`, tx.sub ?? '', true) || check(tx.category, tx.category) ||
    (after.total.level === 'over' && before.total.level !== 'over' ? `⚠️ 本月總花費已超過上限 ${money(-after.total.remain)}` : '')
}

/** 精簡金額：1,234／1.2萬 */
export const compact = (n: number) => {
  const a = Math.abs(Math.round(n))
  if (a >= 100000) return `${Math.round(a / 10000)}萬`
  if (a >= 10000) return `${(a / 10000).toFixed(1).replace(/\.0$/, '')}萬`
  return a.toLocaleString('en-US')
}

/* ---------------- 週期性支出 ---------------- */
/** 第 k 次發生的日期：週＝每 7 天；月／年＝同一日（月底自動夾到當月最後一天） */
export function recurOccurrence(start: string, freq: RecurFreq, k: number): string {
  const [y, m, dd] = start.split('-').map(Number)
  if (freq === 'week') return new Date(Date.UTC(y, m - 1, dd + 7 * k)).toISOString().slice(0, 10)
  const mm = freq === 'month' ? m - 1 + k : m - 1
  const yy = freq === 'year' ? y + k : y
  const lastDay = new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate()
  return new Date(Date.UTC(yy, mm, Math.min(dd, lastDay))).toISOString().slice(0, 10)
}

/** 截至 today 尚未入帳的發生日（已入帳的 lastRun 之前不再補） */
export function dueRecurDates(r: Recur, today: string): string[] {
  const out: string[] = []
  for (let k = 0; k < 800; k++) {
    const d = recurOccurrence(r.start, r.freq, k)
    if (d > today) break
    if (r.lastRun && d <= r.lastRun) continue
    out.push(d)
  }
  return out
}

/* ---------------- 分析：依維度排行支出 ---------------- */
export type ExpDim = 'cat' | 'project' | 'account'
/** 依維度彙整收入或支出（不含轉帳）；專案、帳戶可同時用於收入與支出 */
export function rankBy(s: AppState, start: string, end: string, dim: ExpDim, type: 'expense' | 'income') {
  const acc: Record<string, number> = {}
  let total = 0
  for (const t of s.txs) {
    if (t.type !== type || t.date < start || t.date > end) continue
    const amt = type === 'expense' ? myAmount(t) : t.amount
    const accId = type === 'expense' ? t.fromId : t.toId
    const k =
      dim === 'cat' ? t.category ?? (type === 'expense' ? '其他' : '其他收入')
      : dim === 'project' ? t.project?.trim() || '未標專案'
      : s.accounts.find((a) => a.id === accId)?.name ?? '未知帳戶'
    acc[k] = (acc[k] ?? 0) + amt
    total += amt
  }
  return { total, cats: Object.entries(acc).map(([key, value]) => ({ key, value })).sort((a, b) => b.value - a.value) }
}
