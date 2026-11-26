import type { AppState, CatDef, Grp, Tx } from './types'
import { CATEGORIES, CUSTOM_COLOR_LIST, DEFAULT_FIXED, QUICK_PICKS, expenseCats } from './types'

/**
 * 分類編輯（改名、搬移、合併、刪除、隱藏、排序）。
 * 紀錄是用「名稱」連結分類，所以每個動作都在同一次更新裡，把所有用到這個名稱的地方一起改：
 * 交易、分類上限、子分類上限、單月覆寫、記帳預設值、常用項目、三大類歸屬、分類清單；
 * 另外寫一筆 alias（舊名 → 新名），之後匯入 AndroMoney 舊資料仍會對到新名稱。
 */

export const catsOf = (s: AppState): CatDef[] => expenseCats(s.catExtra, s.catList)
const K = (c: string, sub = '') => `${c}|${sub}`

/** 第一次編輯時，把目前的分類（內建＋自訂）固定成可編輯清單 */
function withList(s: AppState, f: (list: CatDef[]) => CatDef[]): AppState {
  return { ...s, catList: f(catsOf(s).map((c) => ({ ...c, subs: [...c.subs], hiddenSubs: c.hiddenSubs ? [...c.hiddenSubs] : undefined }))) }
}

function addAlias(s: AppState, from: string, to: string): AppState {
  const a = { ...(s.catAlias ?? {}) }
  // 先把指向舊名稱的 alias 改指向新名稱（鏈式改名），再加這一筆
  for (const [k, v] of Object.entries(a)) {
    if (v === from) a[k] = to
    else if (from.endsWith('|*') && v.startsWith(from.slice(0, -1))) a[k] = to.slice(0, -1) + v.slice(from.length - 1)
  }
  if (from !== to) a[from] = to
  delete a[to]
  return { ...s, catAlias: a }
}

/** 匯入用：舊名稱 → 目前名稱（依 alias，最多追 8 層） */
export function resolveAlias(s: AppState, cat: string, sub?: string): { category: string; sub?: string } {
  const a = s.catAlias ?? {}
  const live = catsOf(s)
  let c = cat, sb = sub ?? ''
  for (let i = 0; i < 8; i++) {
    // 名稱現在還存在（例如之後又新增或恢復了同名分類）就不轉址
    const cur = live.find((x) => x.key === c)
    if (cur && (!sb || cur.subs.includes(sb))) break
    const hit = a[K(c, sb)]
    if (hit) { const [nc, ns] = hit.split('|'); c = nc; sb = ns; continue }
    const whole = a[`${c}|*`]
    if (whole) { c = whole.split('|')[0]; continue }
    break
  }
  return { category: c, sub: sb || undefined }
}

const sumInto = (rec: Record<string, number>, k: string, v: number) => { rec[k] = (rec[k] ?? 0) + v }

/** 把 (fromCat, fromSub?) 的所有資料改成 (toCat, toSub?)；fromSub 未指定＝整個分類 */
function rewrite(s0: AppState, fromCat: string, fromSub: string | null, toCat: string, toSub: string | null): AppState {
  const hitSub = (c?: string, sb?: string) => c === fromCat && (fromSub === null || (sb ?? '') === fromSub)
  // 內建預設（常用項目、預設固定支出）先寫成明確設定，改名後才會跟著走
  const defFixed = DEFAULT_FIXED.filter((k) => { const [c, sb] = k.split('|'); return hitSub(c, sb) && !s0.groupMap?.[k] })
  const defPicks = QUICK_PICKS.map((q) => K(q.cat, q.sub))
  const s: AppState = {
    ...s0,
    groupMap: defFixed.length ? { ...Object.fromEntries(defFixed.map((k) => [k, 'fixed' as Grp])), ...s0.groupMap } : s0.groupMap,
    prefs: !s0.prefs?.quickPicks && defPicks.some((k) => { const [c, sb] = k.split('|'); return hitSub(c, sb) }) ? { ...(s0.prefs ?? {}), quickPicks: defPicks } as AppState['prefs'] : s0.prefs,
  }
  const nextSub = (sb?: string) => (fromSub === null ? (toSub === null ? sb : toSub || undefined) : toSub || undefined)
  const txs = s.txs.map((t): Tx => {
    if (t.type !== 'expense' || !hitSub(t.category, t.sub)) return t
    const n: Tx = { ...t, category: toCat, sub: nextSub(t.sub) }
    if (!n.sub) delete n.sub
    return n
  })
  // 分類上限：整個分類合併時加總；只搬子分類時分類上限不動
  let budgets = s.budgets
  if (fromSub === null && fromCat !== toCat) {
    budgets = { ...s.budgets }
    const v = budgets[fromCat]
    delete budgets[fromCat]
    if (v) sumInto(budgets, toCat, v)
  }
  let budgetCfg = s.budgetCfg
  if (budgetCfg) {
    const subs: Record<string, number> = {}
    for (const [k, v] of Object.entries(budgetCfg.subs ?? {})) {
      const [c, sb] = k.split('|')
      if (hitSub(c, sb)) { const ns = nextSub(sb); if (ns) sumInto(subs, K(toCat, ns), v) } // 沒有子分類可對應的子分類上限就不保留（分類上限仍在）
      else sumInto(subs, k, v)
    }
    const overrides = budgetCfg.overrides && fromSub === null && fromCat !== toCat
      ? Object.fromEntries(Object.entries(budgetCfg.overrides).map(([m, o]) => {
          if (!o.cats || !(fromCat in o.cats)) return [m, o]
          const cats = { ...o.cats }
          const v = cats[fromCat]
          delete cats[fromCat]
          sumInto(cats, toCat, v)
          return [m, { ...o, cats }]
        }))
      : budgetCfg.overrides
    budgetCfg = { ...budgetCfg, ...(budgetCfg.subs ? { subs } : {}), ...(overrides ? { overrides } : {}) }
  }
  let prefs = s.prefs
  if (prefs) {
    const p = { ...prefs }
    if (p.category && hitSub(p.category, fromSub === null ? undefined : p.sub)) {
      if (fromSub === null) { p.category = toCat; if (toSub !== null) p.sub = toSub }
      else if ((p.sub ?? '') === fromSub) { p.category = toCat; p.sub = toSub ?? '' }
    }
    if (p.quickPicks) {
      p.quickPicks = [...new Set(p.quickPicks.map((k) => {
        const [c, sb] = k.split('|')
        if (!hitSub(c, sb)) return k
        const ns = nextSub(sb)
        return K(toCat, ns ?? '')
      }))]
    }
    prefs = p
  }
  let groupMap = s.groupMap
  if (groupMap) {
    const g: Record<string, Grp> = {}
    for (const [k, v] of Object.entries(groupMap)) {
      const [c, sb] = k.split('|')
      if (c !== fromCat) { g[k] = v; continue }
      if (sb === '*') { if (fromSub === null) { if (!g[`${toCat}|*`]) g[`${toCat}|*`] = v } else g[k] = v; continue }
      if (hitSub(c, sb)) { const ns = nextSub(sb); if (ns && !g[K(toCat, ns)]) g[K(toCat, ns)] = v }
      else g[k] = v
    }
    groupMap = g
  }
  return { ...s, txs, budgets, budgetCfg, prefs, groupMap }
}

export type OpResult = { ok: true; state: AppState; msg: string } | { ok: false; error: string; conflict?: 'cat' | 'sub' }
const err = (error: string, conflict?: 'cat' | 'sub'): OpResult => ({ ok: false, error, conflict })

export const usedCount = (s: AppState, cat: string, sub?: string) =>
  s.txs.filter((t) => t.type === 'expense' && t.category === cat && (sub === undefined || (t.sub ?? '') === sub)).length

const clean = (n: string, max: number) => n.trim().replace(/[|*]/g, '').slice(0, max)

/** 改分類名稱；新名稱已存在時回傳 conflict，讓畫面詢問是否合併 */
export function renameCat(s: AppState, from: string, toRaw: string): OpResult {
  const to = clean(toRaw, 10)
  if (!to) return err('名稱不能空白')
  if (to === from) return { ok: true, state: s, msg: '名稱沒有變' }
  if (catsOf(s).some((c) => c.key === to)) return err(`已經有「${to}」分類`, 'cat')
  let n = rewrite(s, from, null, to, null)
  const builtin = CATEGORIES.some((b) => b.key === from)
  n = withList(n, (l) => l.map((c) => (c.key === from ? { ...c, key: to, origin: c.origin ?? (builtin && !c.custom ? from : undefined) } : c)))
  n = addAlias(n, `${from}|*`, `${to}|*`)
  return { ok: true, state: n, msg: `已改名為「${to}」，紀錄與上限都跟著改` }
}

/** 整個分類合併到另一個分類（子分類一併帶過去） */
export function mergeCat(s: AppState, from: string, to: string): OpResult {
  if (from === to) return err('不能合併到自己')
  const target = catsOf(s).find((c) => c.key === to)
  const src = catsOf(s).find((c) => c.key === from)
  if (!target) return err('找不到目標分類')
  const cnt = usedCount(s, from)
  let n = rewrite(s, from, null, to, null)
  n = withList(n, (l) => l.filter((c) => c.key !== from).map((c) => (c.key === to ? { ...c, subs: [...c.subs, ...(src?.subs ?? []).filter((x) => !c.subs.includes(x))] } : c)))
  n = addAlias(n, `${from}|*`, `${to}|*`)
  return { ok: true, state: n, msg: `已把「${from}」${cnt ? ` ${cnt} 筆紀錄` : ''}併入「${to}」` }
}

/** 刪除分類：有紀錄時必須給 moveTo（改用 mergeCat）；空的直接刪 */
export function deleteCat(s: AppState, key: string): OpResult {
  if (usedCount(s, key)) return err('這個分類還有紀錄，請選擇要搬去哪個分類，或改成隱藏')
  let n = withList(s, (l) => l.filter((c) => c.key !== key))
  const budgets = { ...n.budgets }
  delete budgets[key]
  const subs = Object.fromEntries(Object.entries(n.budgetCfg?.subs ?? {}).filter(([k]) => !k.startsWith(`${key}|`)))
  const groupMap = Object.fromEntries(Object.entries(n.groupMap ?? {}).filter(([k]) => !k.startsWith(`${key}|`)))
  const prefs = n.prefs?.quickPicks ? { ...n.prefs, quickPicks: n.prefs.quickPicks.filter((k) => !k.startsWith(`${key}|`)) } : n.prefs
  n = { ...n, budgets, budgetCfg: n.budgetCfg ? { ...n.budgetCfg, subs } : n.budgetCfg, groupMap, prefs }
  return { ok: true, state: n, msg: `已刪除「${key}」` }
}

export function patchCat(s: AppState, key: string, patch: Partial<Pick<CatDef, 'emoji' | 'hidden' | 'color'>>): AppState {
  return withList(s, (l) => l.map((c) => (c.key === key ? { ...c, ...patch } : c)))
}

export function moveCat(s: AppState, key: string, d: -1 | 1): AppState {
  return withList(s, (l) => {
    const i = l.findIndex((c) => c.key === key), j = i + d
    if (i < 0 || j < 0 || j >= l.length) return l
    const n = [...l]
    ;[n[i], n[j]] = [n[j], n[i]]
    return n
  })
}

export function addCat(s: AppState, nameRaw: string, emoji?: string): OpResult {
  const name = clean(nameRaw, 10)
  if (!name) return err('名稱不能空白')
  if (catsOf(s).some((c) => c.key === name)) return err(`已經有「${name}」分類`, 'cat')
  const n = withList(s, (l) => [...l, { key: name, emoji: emoji || '🏷️', color: CUSTOM_COLOR_LIST[l.length % CUSTOM_COLOR_LIST.length], subs: [], custom: true }])
  return { ok: true, state: n, msg: `已新增分類「${name}」` }
}

/** 恢復預設：只補回不見的內建分類（含預設子分類），不動使用者自訂的與改過的 */
export function restoreDefaults(s: AppState): OpResult {
  // 改過名的內建分類（origin）也算還在
  const have = new Set(catsOf(s).flatMap((c) => [c.key, c.origin ?? '']))
  const names = new Set(catsOf(s).map((c) => c.key))
  const missing = CATEGORIES.filter((c) => !have.has(c.key) && !names.has(c.key))
  if (!missing.length) return err('內建分類都還在，沒有需要恢復的')
  const n = withList(s, (l) => [...l, ...missing.map((c) => ({ ...c, subs: [...c.subs] }))])
  return { ok: true, state: n, msg: `已恢復 ${missing.map((c) => c.key).join('、')}` }
}

/* ---------- 子分類 ---------- */
export function addSub(s: AppState, cat: string, nameRaw: string): OpResult {
  const name = clean(nameRaw, 12)
  if (!name) return err('名稱不能空白')
  const c = catsOf(s).find((x) => x.key === cat)
  if (!c) return err('找不到分類')
  if (c.subs.includes(name)) return err(`「${cat}」已經有「${name}」`, 'sub')
  return { ok: true, state: withList(s, (l) => l.map((x) => (x.key === cat ? { ...x, subs: [...x.subs, name] } : x))), msg: `已新增「${name}」` }
}

/** 改名／搬到其他分類／合併到既有子分類（toSub 為空字串＝不指定子分類） */
export function moveSub(s: AppState, cat: string, sub: string, toCat: string, toSubRaw: string, opts: { merge?: boolean } = {}): OpResult {
  const toSub = clean(toSubRaw, 12)
  const target = catsOf(s).find((x) => x.key === toCat)
  if (!target) return err('找不到目標分類')
  if (toCat === cat && toSub === sub) return { ok: true, state: s, msg: '沒有變更' }
  if (toSub && target.subs.includes(toSub) && !opts.merge) return err(`「${toCat}」已經有「${toSub}」`, 'sub')
  if (!toSub && toCat === cat && !opts.merge) return err('名稱不能空白')
  const cnt = usedCount(s, cat, sub)
  let n = rewrite(s, cat, sub, toCat, toSub)
  n = withList(n, (l) => l.map((x) => {
    let subs = x.subs
    let hiddenSubs = x.hiddenSubs
    if (x.key === cat) {
      const i = subs.indexOf(sub)
      subs = subs.filter((y) => y !== sub)
      hiddenSubs = hiddenSubs?.filter((y) => y !== sub)
      if (x.key === toCat && toSub && !subs.includes(toSub)) subs.splice(Math.max(0, i), 0, toSub) // 同分類改名：留在原位置
    }
    if (x.key === toCat && toSub && !subs.includes(toSub)) subs = [...subs, toSub]
    return { ...x, subs, hiddenSubs }
  }))
  n = addAlias(n, K(cat, sub), K(toCat, toSub))
  const what = toCat === cat ? `改名為「${toSub}」` : `搬到「${toCat}${toSub ? `・${toSub}` : ''}」`
  return { ok: true, state: n, msg: `「${sub}」已${what}${cnt ? `，${cnt} 筆紀錄跟著改` : ''}` }
}

export function deleteSub(s: AppState, cat: string, sub: string): OpResult {
  if (usedCount(s, cat, sub)) return err('這個子分類還有紀錄，請選擇要搬去哪裡，或改成隱藏')
  let n = withList(s, (l) => l.map((x) => (x.key === cat ? { ...x, subs: x.subs.filter((y) => y !== sub), hiddenSubs: x.hiddenSubs?.filter((y) => y !== sub) } : x)))
  const subs = { ...(n.budgetCfg?.subs ?? {}) }
  delete subs[K(cat, sub)]
  const groupMap = { ...(n.groupMap ?? {}) }
  delete groupMap[K(cat, sub)]
  const prefs = n.prefs ? { ...n.prefs, quickPicks: n.prefs.quickPicks?.filter((k) => k !== K(cat, sub)), ...(n.prefs.category === cat && n.prefs.sub === sub ? { sub: '' } : {}) } : n.prefs
  n = { ...n, budgetCfg: n.budgetCfg ? { ...n.budgetCfg, subs } : n.budgetCfg, groupMap, prefs }
  return { ok: true, state: n, msg: `已刪除「${sub}」` }
}

export function hideSub(s: AppState, cat: string, sub: string, hide: boolean): AppState {
  return withList(s, (l) => l.map((x) => (x.key === cat ? { ...x, hiddenSubs: hide ? [...new Set([...(x.hiddenSubs ?? []), sub])] : (x.hiddenSubs ?? []).filter((y) => y !== sub) } : x)))
}

export function reorderSub(s: AppState, cat: string, sub: string, d: -1 | 1): AppState {
  return withList(s, (l) => l.map((x) => {
    if (x.key !== cat) return x
    const i = x.subs.indexOf(sub), j = i + d
    if (i < 0 || j < 0 || j >= x.subs.length) return x
    const subs = [...x.subs]
    ;[subs[i], subs[j]] = [subs[j], subs[i]]
    return { ...x, subs }
  }))
}
