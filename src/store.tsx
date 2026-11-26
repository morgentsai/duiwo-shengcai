import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Account, AppState, BudgetCfg, EntryPrefs, Grp, Holding, JarEntry, Profile, Recur, Tx } from './types'
import { setCustomCats, visibleCats } from './types'
import { addCat as addCatOp, addSub as addSubOp, catsOf, deleteCat, deleteSub } from './catops'
import type { OpResult } from './catops'
import { applyFull, dueRecurDates, migrate, thisMonth, todayStr, uid, upsertSnapshot, validState } from './logic'
export { validState }
import { buildDemo, clearData } from './demo'
import { supabase } from './supabase'

const LS_KEY = 'morgen-wealth-v3'
/** 舊版 localStorage 鍵，依新到舊嘗試升級 */
const LEGACY_KEYS = ['morgen-wealth-v2', 'morgen-wealth-v1']
const LS_HIDE = 'morgen-wealth-hide'
const LS_LINKED = 'morgen-wealth-linked-user'
const LS_SYNCED = 'morgen-wealth-last-synced'

export type SyncStatus = 'off' | 'idle' | 'syncing' | 'ok' | 'error'

function loadInitial(): AppState {
  try {
    for (const k of [LS_KEY, ...LEGACY_KEYS]) {
      const raw = localStorage.getItem(k)
      if (!raw) continue
      const s = JSON.parse(raw)
      if (validState(s)) return rollFlow(migrate(s))
    }
  } catch {
    /* ignore */
  }
  return buildDemo()
}

/** 外部來的資料（雲端／匯入）一律升級後再用 */
export function adopt(s: AppState): AppState {
  return rollFlow(migrate(s))
}

function rollFlow(s: AppState): AppState {
  const m = thisMonth()
  return s.flow?.month === m ? s : { ...s, flow: { month: m, done: {} } }
}


/** 雲端：每位 Google 帳號只有一列 user_state，RLS 確保只能讀寫自己的那一列 */
async function fetchRemote(): Promise<{ state: AppState; updatedAt: number } | null> {
  const { data, error } = await supabase.from('user_state').select('state, updated_at').maybeSingle()
  if (error) throw new Error(`雲端讀取失敗：${error.message}`)
  if (!data) return null
  return { state: data.state as AppState, updatedAt: Number(data.updated_at) }
}

/** 上傳；若雲端版本較新則不覆蓋，回傳 conflict 讓前端採用雲端資料 */
async function putRemote(s: AppState): Promise<{ conflict: boolean; state?: AppState; updatedAt?: number }> {
  const remote = await fetchRemote()
  if (remote && remote.updatedAt > s.updatedAt) return { conflict: true, state: remote.state, updatedAt: remote.updatedAt }
  const { data: userData, error: userErr } = await supabase.auth.getUser()
  if (userErr || !userData.user) throw new Error('登入已過期，請重新登入')
  const { error } = await supabase
    .from('user_state')
    .upsert({ user_id: userData.user.id, state: s, updated_at: s.updatedAt, saved_at: new Date().toISOString() })
  if (error) throw new Error(`雲端儲存失敗：${error.message}`)
  return { conflict: false }
}


function useStoreValue() {
  const [state, setState] = useState<AppState>(loadInitial)
  const [hidden, setHidden] = useState(() => localStorage.getItem(LS_HIDE) === '1')
  const [toast, setToast] = useState<string>('')
  const [userId, setUserId] = useState<string>('')
  const [userEmail, setUserEmail] = useState<string>('')
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('off')
  const [syncError, setSyncError] = useState('')
  const [lastSynced, setLastSynced] = useState<number>(() => Number(localStorage.getItem(LS_SYNCED) || 0))
  const syncedVersion = useRef<number>(0)
  const stateRef = useRef(state)
  stateRef.current = state

  useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify(state))
  }, [state])
  const expCats = useMemo(() => catsOf(state), [state.catExtra, state.catList]) // eslint-disable-line react-hooks/exhaustive-deps
  const pickCats = useMemo(() => visibleCats(expCats), [expCats])
  setCustomCats(expCats)
  useEffect(() => {
    localStorage.setItem(LS_HIDE, hidden ? '1' : '0')
  }, [hidden])

  const flash = useCallback((msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast((t) => (t === msg ? '' : t)), 2200)
  }, [])

  const commit = useCallback((fn: (s: AppState) => AppState) => {
    setState((s) => {
      const next = fn(rollFlow(s))
      if (next === s) return s
      const hasInv = next.accounts.some((a) => a.kind === 'broker') && (next.holdings.length > 0 || next.invSnapshots.length > 0)
      return { ...next, invSnapshots: hasInv ? upsertSnapshot(next) : next.invSnapshots, updatedAt: Date.now() }
    })
  }, [])

  // ---------- 交易 ----------
  /** 新增一或多筆交易（可指定同一群組） */
  const addTxs = useCallback(
    (items: (Omit<Tx, 'id'> & { id?: string })[], group?: { id: string; title: string }) =>
      commit((s) => {
        let cur = s
        const fresh: Tx[] = []
        for (const it of items) {
          if (!(it.amount > 0)) continue
          const tx: Tx = { ...it, id: it.id ?? uid(), ...(group ? { groupId: group.id, groupTitle: group.title } : {}) }
          const r = applyFull(cur, tx, 1)
          cur = r.state
          fresh.push(r.tx)
        }
        return { ...cur, txs: [...fresh.reverse(), ...s.txs] }
      }),
    [commit],
  )
  const addTx = useCallback((t: Omit<Tx, 'id'> & { id?: string }) => addTxs([t]), [addTxs])
  const updateTx = useCallback(
    (id: string, next: Tx) =>
      commit((s) => {
        const old = s.txs.find((t) => t.id === id)
        if (!old) return s
        const back = applyFull(s, old, -1).state
        const r = applyFull(back, { ...next, id, split: undefined }, 1)
        return { ...r.state, txs: s.txs.map((t) => (t.id === id ? r.tx : t)) }
      }),
    [commit],
  )
  const deleteTx = useCallback(
    (id: string) =>
      commit((s) => {
        const old = s.txs.find((t) => t.id === id)
        if (!old) return s
        return { ...applyFull(s, old, -1).state, txs: s.txs.filter((t) => t.id !== id) }
      }),
    [commit],
  )
  /** 刪除整個群組 */
  const deleteGroup = useCallback(
    (groupId: string) =>
      commit((s) => {
        let cur = s
        for (const t of s.txs) if (t.groupId === groupId) cur = applyFull(cur, t, -1).state
        return { ...cur, txs: s.txs.filter((t) => t.groupId !== groupId) }
      }),
    [commit],
  )

  /** 信用卡自動扣繳（同月份歸成一組） */
  const autopay = useCallback(
    (cardIds: string[]) => {
      const s = stateRef.current
      const m = thisMonth()
      const items = cardIds
        .map((id) => s.accounts.find((a) => a.id === id))
        .filter((c): c is Account => !!c && (c.billed ?? 0) > 0)
        .map((c) => ({ type: 'transfer' as const, amount: c.billed ?? 0, date: todayStr(), fromId: c.payAccountId, toId: c.id, note: `${c.name} 自動扣繳`, tag: 'cardpay' as const, category: '信用卡費' }))
      addTxs(items, { id: `autopay-${m}`, title: `${Number(m.slice(5))} 月卡費自動扣繳` })
      return items.reduce((x, t) => x + t.amount, 0)
    },
    [addTxs],
  )
  /** 收回代墊：沖銷待收，不算收入 */
  const collect = useCallback(
    (receivableIds: string[], toId: string, date: string) => {
      const s = stateRef.current
      const rs = s.receivables.filter((r) => receivableIds.includes(r.id) && !r.collectedBy)
      const amount = rs.reduce((x, r) => x + r.amount, 0)
      if (!amount) return 0
      const names = [...new Set(rs.map((r) => r.friend))].join('、')
      addTx({ type: 'transfer', amount, date, toId, tag: 'collect', category: '收回代墊', receivableIds: rs.map((r) => r.id), note: `${names} 還代墊款` })
      return amount
    },
    [addTx],
  )

  // ---------- 發薪日分流 ----------
  const runFlow = useCallback(
    (key: string, items: Omit<Tx, 'id' | 'date'>[], group?: { id: string; title: string }) =>
      commit((s) => {
        let cur = s
        const newTxs: Tx[] = []
        for (const it of items) {
          if (it.amount <= 0) continue
          const tx: Tx = { ...it, id: uid(), date: todayStr(), flowKey: key, ...(group ? { groupId: group.id, groupTitle: group.title } : {}) }
          const r = applyFull(cur, tx, 1)
          cur = r.state
          newTxs.push(r.tx)
        }
        return {
          ...cur,
          txs: [...newTxs.reverse(), ...s.txs],
          flow: { ...s.flow, done: { ...s.flow.done, [key]: newTxs.map((t) => t.id) } },
        }
      }),
    [commit],
  )
  const resetFlow = useCallback(
    (revert: boolean) =>
      commit((s) => {
        if (!revert) return { ...s, flow: { month: thisMonth(), done: {} } }
        const ids = new Set(Object.values(s.flow.done).flat())
        let cur = s
        for (const t of s.txs) if (ids.has(t.id)) cur = applyFull(cur, t, -1).state
        return { ...cur, txs: s.txs.filter((t) => !ids.has(t.id)), flow: { month: thisMonth(), done: {} } }
      }),
    [commit],
  )

  // ---------- 帳戶 ----------
  const upsertAccount = useCallback(
    (a: Account) =>
      commit((s) => ({
        ...s,
        accounts: s.accounts.some((x) => x.id === a.id) ? s.accounts.map((x) => (x.id === a.id ? a : x)) : [...s.accounts, a],
      })),
    [commit],
  )
  const deleteAccount = useCallback(
    (id: string) =>
      commit((s) => ({
        ...s,
        accounts: s.accounts.filter((a) => a.id !== id),
        holdings: s.holdings.filter((h) => h.brokerId !== id),
      })),
    [commit],
  )
  const cardStatement = useCallback(
    (id: string) =>
      commit((s) => ({
        ...s,
        accounts: s.accounts.map((a) => (a.id === id ? { ...a, billed: (a.billed ?? 0) + (a.unbilled ?? 0), unbilled: 0 } : a)),
      })),
    [commit],
  )

  // ---------- 持倉 ----------
  const upsertHolding = useCallback(
    (h: Holding) =>
      commit((s) => ({
        ...s,
        holdings: s.holdings.some((x) => x.id === h.id) ? s.holdings.map((x) => (x.id === h.id ? h : x)) : [...s.holdings, h],
      })),
    [commit],
  )
  const deleteHolding = useCallback((id: string) => commit((s) => ({ ...s, holdings: s.holdings.filter((h) => h.id !== id) })), [commit])

  /** 分類編輯：純函式算出新狀態，一次 commit（改名會同時改交易、上限、預設值、常用項目、三大類） */
  const catOp = useCallback((f: (s: AppState) => OpResult): OpResult => {
    const r = f(stateRef.current)
    if (r.ok) commit((s) => { const r2 = f(s); return r2.ok ? r2.state : s })
    return r
  }, [commit])
  const catEdit = useCallback((f: (s: AppState) => AppState) => commit(f), [commit])
  const addCustomCat = useCallback((key: string, emoji?: string) => { catOp((s) => addCatOp(s, key, emoji)) }, [catOp])
  const removeCustomCat = useCallback((key: string) => { catOp((s) => deleteCat(s, key)) }, [catOp])
  const removeCustomSub = useCallback((cat: string, sub: string) => { catOp((s) => deleteSub(s, cat, sub)) }, [catOp])
  const addCustomSub = useCallback((cat: string, sub: string) => { catOp((s) => addSubOp(s, cat, sub)) }, [catOp])

  const setPrefs = useCallback((patch: Partial<EntryPrefs>) => commit((s) => ({ ...s, prefs: { ...(s.prefs ?? {}), ...patch } })), [commit])
  const setProfile = useCallback((patch: Partial<Profile>) => commit((s) => ({ ...s, profile: { ...(s.profile ?? {}), ...patch } })), [commit])
  const setBudgetCfg = useCallback((cfg: BudgetCfg) => commit((s) => ({ ...s, budgetCfg: cfg })), [commit])
  /** 三大類歸屬：v＝undefined 代表改回預設 */
  const setGroup = useCallback((key: string, v?: Grp) => commit((s) => {
    const m = { ...(s.groupMap ?? {}) }
    if (v) m[key] = v
    else delete m[key]
    return { ...s, groupMap: m }
  }), [commit])
  const setBudget = useCallback((cat: string, v: number) => commit((s) => ({ ...s, budgets: { ...s.budgets, [cat]: v } })), [commit])

  /** 匯入外部記帳（AndroMoney CSV）：依 id 去重；applyBalances=false 時只當歷史紀錄，不動目前餘額 */
  const importTxs = useCallback(
    (txs: Tx[], newAccounts: Account[], applyBalances: boolean) => {
      commit((s) => {
        const have = new Set(s.txs.map((t) => t.id))
        let cur: AppState = { ...s, accounts: [...s.accounts, ...newAccounts.filter((a) => !s.accounts.some((x) => x.id === a.id))] }
        const fresh: Tx[] = []
        for (const t of txs) {
          if (have.has(t.id)) continue
          have.add(t.id)
          if (applyBalances) {
            const r = applyFull(cur, t, 1)
            cur = r.state
            fresh.push(r.tx)
          } else fresh.push(t)
        }
        const all = [...fresh, ...s.txs].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
        return { ...cur, txs: all }
      })
    },
    [commit],
  )

  const clearDemo = useCallback(() => commit((s) => ({ ...clearData(s), ...(s.profile ? { profile: s.profile } : {}) })), [commit])
  const loadDemo = useCallback(() => commit((s) => ({ ...buildDemo(), ...(s.prefs ? { prefs: s.prefs } : {}), ...(s.profile ? { profile: s.profile } : {}) })), [commit])
  const importState = useCallback((s: AppState) => commit(() => adopt(s)), [commit])

  // ---------- 撲滿 ----------
  const addJar = useCallback(
    (j: { name: string; emoji: string; target?: number }) =>
      commit((s) => ({ ...s, jars: [...(s.jars ?? []), { id: uid(), name: j.name, emoji: j.emoji || '🐷', target: j.target && j.target > 0 ? j.target : undefined, balance: 0 }] })),
    [commit],
  )
  const deleteJar = useCallback(
    (id: string) => commit((s) => ({ ...s, jars: (s.jars ?? []).filter((j) => j.id !== id), jarLog: (s.jarLog ?? []).filter((e) => e.jarId !== id) })),
    [commit],
  )
  /** delta > 0 存入、< 0 取出；不會低於 0 */
  const moveJar = useCallback(
    (jarId: string, delta: number, date: string, note: string, key?: string) =>
      commit((s) => {
        const jar = (s.jars ?? []).find((j) => j.id === jarId)
        if (!jar || !delta) return s
        const amount = Math.max(-jar.balance, delta)
        const entry: JarEntry = { id: uid(), jarId, amount, date, note, ...(key ? { key } : {}) }
        return {
          ...s,
          jars: (s.jars ?? []).map((j) => (j.id === jarId ? { ...j, balance: j.balance + amount } : j)),
          jarLog: [entry, ...(s.jarLog ?? [])],
        }
      }),
    [commit],
  )

  const addRecur = useCallback(
    (r: Omit<Recur, 'id'>) => commit((s) => ({ ...s, recurs: [...(s.recurs ?? []), { ...r, id: uid() }] })),
    [commit],
  )
  const removeRecur = useCallback(
    (id: string) => commit((s) => ({ ...s, recurs: (s.recurs ?? []).filter((r) => r.id !== id) })),
    [commit],
  )
  /** 依規則補記截至今天的發生日，一次 commit 完成（含更新 lastRun），避免重複入帳 */
  const runRecur = useCallback(
    () =>
      commit((s) => {
        const rules = s.recurs ?? []
        if (!rules.length) return s
        const today = todayStr()
        let cur = s
        const fresh: Tx[] = []
        const nextRules = rules.map((r) => {
          const dates = dueRecurDates(r, today)
          if (!dates.length) return r
          for (const d of dates) {
            const tx: Tx = { ...r.tpl, id: uid(), date: d, type: 'expense' }
            if (!(tx.amount > 0)) continue
            const res = applyFull(cur, tx, 1)
            cur = res.state
            fresh.push(res.tx)
          }
          return { ...r, lastRun: dates[dates.length - 1] }
        })
        if (fresh.length === 0 && nextRules.every((r, i) => r === rules[i])) return s
        return { ...cur, recurs: nextRules, txs: [...fresh.reverse(), ...s.txs] }
      }),
    [commit],
  )
  useEffect(() => { runRecur() }, [runRecur])

  // ---------- 雲端同步（Supabase + Google 登入） ----------
  const pull = useCallback(async () => {
    const r = await fetchRemote()
    if (r && validState(r.state) && r.updatedAt > stateRef.current.updatedAt) {
      syncedVersion.current = r.updatedAt
      setState(adopt(r.state))
      return true
    }
    return false
  }, [])

  const push = useCallback(async () => {
    const s = stateRef.current
    const r = await putRemote(s)
    if (r.conflict && r.state && r.updatedAt !== undefined && validState(r.state)) {
      syncedVersion.current = r.updatedAt
      setState(adopt(r.state))
    } else syncedVersion.current = s.updatedAt
  }, [])

  const markSynced = useCallback(() => {
    const now = Date.now()
    setLastSynced(now)
    localStorage.setItem(LS_SYNCED, String(now))
    setSyncStatus('ok')
    setSyncError('')
  }, [])

  const syncNow = useCallback(async () => {
    if (!userId) return
    setSyncStatus('syncing')
    try {
      await pull()
      if (stateRef.current.updatedAt > syncedVersion.current) await push()
      markSynced()
    } catch (e) {
      setSyncStatus('error')
      setSyncError((e as Error).message)
    }
  }, [userId, pull, push, markSynced])

  // 登入狀態：目前登入的 Google 帳號
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user.id ?? '')
      setUserEmail(data.session?.user.email ?? '')
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user.id ?? '')
      setUserEmail(session?.user.email ?? '')
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  // 登入後的首次連結：若此裝置還沒連過這個帳號，且雲端已有資料，詢問要用哪一份
  useEffect(() => {
    if (!userId) {
      setSyncStatus('off')
      return
    }
    let cancelled = false
    const link = async () => {
      setSyncStatus('syncing')
      try {
        const linked = localStorage.getItem(LS_LINKED)
        const r = await fetchRemote()
        if (cancelled) return
        if (linked !== userId && r && validState(r.state)) {
          const useRemote = window.confirm(
            `這個 Google 帳號在雲端已有資料（最後更新：${new Date(r.updatedAt).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false })}）。\n\n按「確定」載入雲端資料到此裝置；按「取消」改用此裝置的資料覆蓋雲端。`,
          )
          if (useRemote) {
            syncedVersion.current = r.updatedAt
            setState(adopt(r.state))
          } else {
            const s = { ...stateRef.current, updatedAt: Date.now() }
            setState(s)
            stateRef.current = s
            await push()
          }
        } else {
          await pull()
          if (stateRef.current.updatedAt > syncedVersion.current) await push()
        }
        localStorage.setItem(LS_LINKED, userId)
        if (!cancelled) {
          markSynced()
          flash('已啟用雲端同步')
        }
      } catch (e) {
        if (!cancelled) {
          setSyncStatus('error')
          setSyncError((e as Error).message)
        }
      }
    }
    link()
    return () => {
      cancelled = true
    }
  }, [userId, pull, push, markSynced, flash])

  const signIn = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + window.location.pathname },
    })
    if (error) {
      setSyncStatus('error')
      setSyncError(`登入失敗：${error.message}`)
    }
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    localStorage.removeItem(LS_LINKED)
    setSyncStatus('off')
    flash('已登出（資料仍保留在此裝置）')
  }, [flash])

  // 本機變更 → 延遲上傳
  useEffect(() => {
    if (!userId || state.updatedAt <= syncedVersion.current) return
    const t = window.setTimeout(() => {
      setSyncStatus('syncing')
      push()
        .then(markSynced)
        .catch((e: Error) => {
          setSyncStatus('error')
          setSyncError(e.message)
        })
    }, 1200)
    return () => window.clearTimeout(t)
  }, [state.updatedAt, userId, push, markSynced])

  // 回到 App 或每 30 秒 → 拉取雲端較新版本
  useEffect(() => {
    if (!userId) return
    const tick = () => {
      if (document.visibilityState !== 'visible') return
      pull()
        .then(markSynced)
        .catch(() => setSyncStatus('error'))
    }
    tick()
    const iv = window.setInterval(tick, 30000)
    document.addEventListener('visibilitychange', tick)
    return () => {
      window.clearInterval(iv)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [userId, pull, markSynced])

  return {
    state, hidden, setHidden, toast, flash,
    addTx, updateTx, deleteTx, runFlow, resetFlow,
    upsertAccount, deleteAccount, cardStatement, upsertHolding, deleteHolding, setBudget, setBudgetCfg, setProfile, setGroup, setPrefs, addCustomCat, addCustomSub, removeCustomCat, removeCustomSub, expCats, pickCats, catOp, catEdit,
    clearDemo, loadDemo, importState, importTxs, addTxs, deleteGroup, autopay, collect, addJar, deleteJar, moveJar,
    addRecur, removeRecur, runRecur,
    userEmail, syncStatus, syncError, lastSynced, signIn, signOut, syncNow,
  }
}

export type Store = ReturnType<typeof useStoreValue>
const Ctx = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const v = useStoreValue()
  const memo = useMemo(() => v, [v])
  return <Ctx.Provider value={memo}>{children}</Ctx.Provider>
}

export function useStore() {
  const v = useContext(Ctx)
  if (!v) throw new Error('StoreProvider missing')
  return v
}
