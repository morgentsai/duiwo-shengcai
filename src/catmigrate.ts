import type { AppState, EntryPrefs } from './types'

/**
 * 支出分類的歷次改版對照，依序串接執行（v1 格式升級之後）：
 *  step 1（v2.9）：舊版 11 個精簡分類 → AndroMoney 14 分類
 *  step 2（v3.0）：14 分類 → 最終 10 分類
 * 每一步只認得自己的「來源名稱」，跑過之後舊名稱就不存在 → 可重複執行（idempotent）。
 * 只改名、搬家；不刪任何紀錄。上限合併時加總。
 */
interface Step {
  /** 舊分類 → 新分類（沒有在 sub 對照到的子分類，就只換分類、子分類原樣保留） */
  rename: Record<string, string>
  /** `舊分類|舊子分類` → [新分類, 新子分類（'' ＝ 不指定）] */
  sub: Record<string, [string, string]>
}

const STEP1: Step = {
  rename: { 交通移動: '運輸交通', '3C與訂閱': '3C通訊', 學習與休閒: '教育&休閒', 人情與公益: '人情交際' },
  sub: {
    '餐飲食品|點心零食': ['餐飲食品', '點心零嘴'],
    '居家生活|居家日用': ['居家生活', '居家雜務'],
    '居家生活|水電網費': ['居家生活', '電費'],
    '交通移動|停車費': ['汽機車', '停車費'],
    '交通移動|油錢': ['汽機車', '油錢'],
    '交通移動|保險稅費／罰單': ['汽機車', '保險與稅捐'],
    '交通移動|大眾運輸': ['運輸交通', '公車'],
    '交通移動|計程車': ['運輸交通', '計程車'],
    '3C與訂閱|AI 訂閱': ['教育&休閒', 'ai'],
    '3C與訂閱|3C 設備': ['3C通訊', '3C設備'],
    '學習與休閒|書／課程': ['教育&休閒', '書'],
    '學習與休閒|電影娛樂': ['教育&休閒', '電影'],
    '服飾美容|衣物穿搭': ['服飾美容', '衣服'],
    '服飾美容|保養美妝': ['服飾美容', '保養品'],
    '人情與公益|紅包交際': ['人情交際', '應酬交際'],
    '人情與公益|捐款': ['捐款', '捐款'],
    '人情與公益|拜拜': ['捐款', '拜拜'],
    '醫療保健|體檢／健保': ['醫療保健', '身體檢查'],
  },
}

const STEP2: Step = {
  rename: { 購物: '居家生活', 運輸交通: '交通', 汽機車: '交通', '教育&休閒': '學習與3C', '3C通訊': '學習與3C', 人情交際: '人情公益', 捐款: '人情公益' },
  sub: {
    '服飾美容|上衣': ['服飾美容', '衣服'],
    '服飾美容|褲子': ['服飾美容', '衣服'],
    '服飾美容|外套': ['服飾美容', '衣服'],
    '服飾美容|鞋子': ['服飾美容', '鞋包配件'],
    '服飾美容|包包': ['服飾美容', '鞋包配件'],
    '服飾美容|配件': ['服飾美容', '鞋包配件'],
    '購物|網購': ['居家生活', '網購'],
    '購物|日用品': ['居家生活', '日用品'],
    '購物|生活用品': ['居家生活', '日用品'],
    '購物|禮品': ['休閒娛樂', '小禮物'],
    '購物|其他': ['居家生活', '雜支'],
    '居家生活|房租': ['居家生活', '房租水電'],
    '居家生活|電費': ['居家生活', '房租水電'],
    '居家生活|寵物相關': ['居家生活', '寵物'],
    '運輸交通|公車': ['交通', '大眾運輸'],
    '運輸交通|捷運': ['交通', '大眾運輸'],
    '運輸交通|高鐵': ['交通', '高鐵火車'],
    '運輸交通|火車': ['交通', '高鐵火車'],
    '汽機車|燃料費': ['交通', '油錢'],
    '汽機車|停車費': ['交通', '停車過路'],
    '汽機車|過路費': ['交通', '停車過路'],
    '汽機車|美容洗車': ['交通', '維修保養'],
    '汽機車|保險與稅捐': ['交通', '保險稅捐'],
    '汽機車|罰單': ['交通', '保險稅捐'],
    '汽機車|租車費': ['交通', '租車'],
    '教育&休閒|水晶夥伴': ['休閒娛樂', '水晶'],
    '教育&休閒|水晶': ['休閒娛樂', '水晶'],
    '教育&休閒|電影': ['休閒娛樂', '電影'],
    '教育&休閒|其他': ['休閒娛樂', '其他'],
    '3C通訊|電話費': ['學習與3C', '電話網路'],
    '3C通訊|雲端空間': ['學習與3C', '訂閱'],
    '醫療保健|勞健保費': ['醫療保健', '保險費'],
    '人情交際|應酬交際': ['人情公益', '送禮請客'],
    '旅遊|代墊款': ['旅遊', ''],
  },
}

const STEPS = [STEP1, STEP2]

function mapOne(step: Step, cat: string | undefined, sub: string | undefined, custom: Set<string>): { category?: string; sub?: string } {
  if (!cat || custom.has(cat)) return { category: cat, sub }
  const hit = sub ? step.sub[`${cat}|${sub}`] : undefined
  if (hit) return { category: hit[0], sub: hit[1] || undefined }
  return { category: step.rename[cat] ?? cat, sub }
}

/** 單筆：任何舊版分類／子分類 → 目前的 10 分類（custom＝使用者自訂分類，同名時不改） */
export function mapCat(cat: string | undefined, sub: string | undefined, custom: Set<string> = new Set()) {
  let r: { category?: string; sub?: string } = { category: cat, sub }
  for (const st of STEPS) r = mapOne(st, r.category, r.sub, custom)
  return r
}

const stale = (cat?: string, sub?: string) => !!cat && STEPS.some((st) => cat in st.rename || (!!sub && `${cat}|${sub}` in st.sub))

/** 舊分類名稱 → 新分類（只看分類，給上限／自訂子分類用） */
const mapKey = (k: string, custom: Set<string>) => mapCat(k, undefined, custom).category ?? k

export const CAT_VER = 2

export function migrateCats(input: AppState): AppState {
  // 已是 10 分類（或使用者已自行編輯分類）：不再套舊名稱對照，避免把她新取的名字（例如「房租」）又改掉
  if ((input.catVer ?? 0) >= CAT_VER) return input
  return { ...migrateOldNames(input), catVer: CAT_VER }
}

function migrateOldNames(s: AppState): AppState {
  const custom = new Set((s.catExtra?.cats ?? []).map((c) => c.key))
  const st = (c?: string, sub?: string) => !custom.has(c ?? '') && stale(c, sub)
  const splitKey = (k: string) => k.split('|') as [string, string]
  const touched =
    s.txs.some((t) => t.type === 'expense' && st(t.category, t.sub)) ||
    Object.keys(s.budgets ?? {}).some((k) => st(k)) ||
    Object.keys(s.budgetCfg?.subs ?? {}).some((k) => st(...splitKey(k))) ||
    Object.values(s.budgetCfg?.overrides ?? {}).some((o) => Object.keys(o.cats ?? {}).some((k) => st(k))) ||
    Object.entries(s.catExtra?.subs ?? {}).some(([k, l]) => st(k) || l.some((x) => st(k, x))) ||
    st(s.prefs?.category, s.prefs?.sub) ||
    (s.prefs?.quickPicks ?? []).some((k) => st(...splitKey(k)))
  if (!touched) return s
  const m = (c?: string, sub?: string) => mapCat(c, sub, custom)

  const txs = s.txs.map((t) => {
    if (t.type !== 'expense' || !st(t.category, t.sub)) return t
    const r = m(t.category, t.sub)
    const n = { ...t, category: r.category, sub: r.sub }
    if (!r.sub) delete n.sub
    return n
  })
  /** 分類上限：合併到同一個新分類時加總 */
  const mergeCats = (rec: Record<string, number> = {}) => {
    const out: Record<string, number> = {}
    for (const [k, v] of Object.entries(rec)) {
      const nk = mapKey(k, custom)
      out[nk] = (out[nk] ?? 0) + v
    }
    return out
  }
  const budgets = mergeCats(s.budgets)
  let budgetCfg = s.budgetCfg
  if (budgetCfg) {
    const subs: Record<string, number> = {}
    for (const [k, v] of Object.entries(budgetCfg.subs ?? {})) {
      const [c, sub] = splitKey(k)
      const r = m(c, sub || undefined)
      // 子分類被併掉（例如 旅遊|代墊款 → 旅遊）時，上限沒有對應的子分類 → 不保留子分類上限（分類上限仍在）
      if (!r.sub && sub) continue
      const nk = `${r.category}|${r.sub ?? ''}`
      subs[nk] = (subs[nk] ?? 0) + v
    }
    const overrides = budgetCfg.overrides
      ? Object.fromEntries(Object.entries(budgetCfg.overrides).map(([mon, o]) => [mon, o.cats ? { ...o, cats: mergeCats(o.cats) } : o]))
      : undefined
    budgetCfg = { ...budgetCfg, ...(budgetCfg.subs ? { subs } : {}), ...(overrides ? { overrides } : {}) }
  }
  let catExtra = s.catExtra
  if (catExtra?.subs) {
    const subs: Record<string, string[]> = {}
    for (const [k, list] of Object.entries(catExtra.subs)) {
      const base = mapKey(k, custom)
      subs[base] ??= []
      for (const sub of list) {
        const r = m(k, sub)
        const nk = r.category ?? base
        subs[nk] ??= []
        if (r.sub && !subs[nk].includes(r.sub)) subs[nk].push(r.sub)
      }
    }
    catExtra = { ...catExtra, subs }
  }
  let prefs = s.prefs
  if (prefs) {
    const p: Partial<EntryPrefs> = { ...prefs }
    if (st(p.category, p.sub || undefined)) {
      const r = m(p.category, p.sub || undefined)
      p.category = r.category
      p.sub = r.sub ?? ''
    }
    if (p.quickPicks) {
      p.quickPicks = [...new Set(p.quickPicks.map((k) => {
        const [c, sub] = splitKey(k)
        const r = m(c, sub || undefined)
        return `${r.category}|${r.sub ?? ''}`
      }))].filter((k) => !k.startsWith('代墊款|')) // 代墊款已改用分帳，不再當常用項目
    }
    prefs = p
  }
  return { ...s, txs, budgets, budgetCfg, catExtra, prefs }
}
