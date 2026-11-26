import { useMemo, useState } from 'react'
import type { Account, EntryMode, EntryPrefs } from '../types'
import { INCOME_CATEGORIES, isFx } from '../types'
import { useStore } from '../store'
import { cashWallet, quickKey, quickPickOf, resolvePrefs } from '../logic'
import { Segmented } from './ui'
import { AccountSelect } from './TxEditor'

const MODES: EntryMode[] = ['expense', 'income', 'transfer', 'withdraw']
const MODE_LABEL: Record<EntryMode, string> = { expense: '支出', income: '收入', transfer: '轉帳', withdraw: '領現' }

/** 設定頁：記帳預設值（隨同步資料一起存） */
export function EntryPrefsCard({ standalone }: { standalone?: boolean } = {}) {
  const { state, setPrefs, pickCats: expCats, hidden, flash } = useStore()
  const P = useMemo(() => resolvePrefs(state), [state])
  const accs = state.accounts
  const cards = accs.filter((a) => a.kind === 'card')
  const cash = cashWallet(accs)
  const wallets = accs.filter((a) => a.kind === 'cash').sort((a) => (a.id === cash?.id ? -1 : 1))
  const banks = accs.filter((a) => a.kind === 'bank' && !isFx(a))
  const fx = accs.filter((a) => a.kind === 'bank' && isFx(a))
  const brokers = accs.filter((a) => a.kind === 'broker')
  const loans = accs.filter((a) => a.kind === 'loan')
  const G = {
    cards: ['信用卡', cards] as [string, Account[]],
    wallets: ['現金與電子錢包', wallets] as [string, Account[]],
    banks: ['銀行帳戶', banks] as [string, Account[]],
    fx: ['外幣帳戶', fx] as [string, Account[]],
    brokers: ['證券交割戶', brokers] as [string, Account[]],
    loans: ['其他負債', loans] as [string, Account[]],
  }
  const [openState, setOpen] = useState(false)
  const open = standalone || openState
  const [addKey, setAddKey] = useState('')
  /** 目前正在編輯哪一類的預設值（只影響這個畫面，不會改到打開時的預設分頁） */
  const [editMode, setEditMode] = useState<EntryMode>('expense')
  const incDef = INCOME_CATEGORIES.find((c) => c.key === P.incomeCat)
  const set = (patch: Partial<EntryPrefs>) => setPrefs(patch)
  const catDef = expCats.find((c) => c.key === P.category)
  const qp = P.quickPicks
  const move = (i: number, d: -1 | 1) => {
    const j = i + d
    if (j < 0 || j >= qp.length) return
    const n = [...qp]
    ;[n[i], n[j]] = [n[j], n[i]]
    set({ quickPicks: n })
  }
  const toggleFav = (id: string) => set({ favAccounts: P.favAccounts.includes(id) ? P.favAccounts.filter((x) => x !== id) : [...P.favAccounts, id] })
  const reset = () => {
    if (!window.confirm('把所有記帳預設值恢復成原本設定？')) return
    const blank: Partial<EntryPrefs> = {}
    for (const k of ['defaultMode', 'payId', 'rememberLastPay', 'lastPayId', 'category', 'sub', 'favAccounts', 'quickPicks', 'transferFrom', 'transferTo', 'withdrawFrom', 'withdrawTo', 'incomeTo', 'incomeCat', 'incomeSub', 'rememberLastIncome', 'lastIncomeTo'] as (keyof EntryPrefs)[]) (blank as Record<string, undefined>)[k] = undefined
    set(blank)
    flash('已恢復預設值')
  }

  return (
    <section className="card prefs-card" id="entry-prefs">
      {!standalone && (
        <button className="card-head as-btn" onClick={() => setOpen(!open)} aria-expanded={open}>
        <h2>記帳預設值</h2>
        <span className="muted small">{open ? '收合' : '打開快速記帳時的預設與快捷鍵 ›'}</span>
      </button>
      )}
      {open && (
        <div className="prefs">
          <label className="field pref-open">
            <span className="field-label">打開快速記帳時的預設分頁</span>
            <select value={P.defaultMode} onChange={(e) => { set({ defaultMode: e.target.value as EntryMode }); flash(`打開快速記帳時會先顯示「${MODE_LABEL[e.target.value as EntryMode]}」`) }} aria-label="打開快速記帳時的預設分頁">
              {MODES.map((m) => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}
            </select>
          </label>

          <div className="pref">
            <span className="field-label">編輯各類型的預設值</span>
            <Segmented<EntryMode>
              value={editMode}
              onChange={setEditMode}
              options={MODES.map((m) => ({ value: m, label: MODE_LABEL[m] }))}
            />
          </div>

          {editMode === 'expense' && (<>
          <h3 className="pref-h">支出預設值</h3>
          <AccountSelect label="預設付款方式" value={P.payId} onChange={(v) => v && set({ payId: v })} groups={[G.cards, G.wallets, G.banks]} hidden={hidden} />
          <label className="toggle-row">
            <span>記住上次用的付款方式<br /><span className="muted tiny">開啟後，新的一筆會沿用上次的付款方式，而不是固定預設</span></span>
            <input type="checkbox" className="switch" checked={P.rememberLastPay} onChange={(e) => set({ rememberLastPay: e.target.checked })} />
          </label>
          <div className="two-col">
            <label className="field">
              <span className="field-label">預設分類</span>
              <select value={P.category} onChange={(e) => set({ category: e.target.value, sub: '' })}>
                {expCats.map((c) => <option key={c.key} value={c.key}>{c.emoji} {c.key}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="field-label">預設子分類</span>
              <select value={P.sub} onChange={(e) => set({ sub: e.target.value })}>
                <option value="">（不指定）</option>
                {(catDef?.subs ?? []).map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
          </div>

          <div className="pref">
            <span className="field-label">付款方式快捷按鈕（★）</span>
            <div className="chip-row">
              {[...cards, ...wallets, ...banks].map((a) => (
                <button key={a.id} type="button" className={`chip small ${P.favAccounts.includes(a.id) ? 'on' : ''}`} onClick={() => toggleFav(a.id)}>
                  {P.favAccounts.includes(a.id) ? '★ ' : ''}{a.name}
                </button>
              ))}
            </div>
            <span className="muted tiny">預設付款方式一定會出現；其他帳戶都收在「其他」下拉選單。</span>
          </div>

          <div className="pref">
            <span className="field-label">常用項目（依順序顯示）</span>
            <div className="qp-list">
              {qp.map((k, i) => {
                const q = quickPickOf(k)
                return (
                  <div key={k} className="qp-row">
                    <span className="qp-name">{q.emoji} {q.label}<span className="muted tiny">　{q.cat}</span></span>
                    <button className="icon-btn sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`${q.label} 上移`}>↑</button>
                    <button className="icon-btn sm" disabled={i === qp.length - 1} onClick={() => move(i, 1)} aria-label={`${q.label} 下移`}>↓</button>
                    <button className="icon-btn sm" onClick={() => set({ quickPicks: qp.filter((x) => x !== k) })} aria-label={`移除 ${q.label}`}>✕</button>
                  </div>
                )
              })}
              {!qp.length && <p className="muted small">目前沒有常用項目，快速記帳會直接從分類開始。</p>}
            </div>
            <div className="qp-add">
              <select value={addKey} onChange={(e) => setAddKey(e.target.value)} aria-label="新增常用項目">
                <option value="">＋ 加入常用項目…</option>
                {expCats.map((c) => (
                  <optgroup key={c.key} label={`${c.emoji} ${c.key}`}>
                    {(c.subs.length ? c.subs : ['']).map((s) => {
                      const k = quickKey(c.key, s)
                      return <option key={k} value={k} disabled={qp.includes(k)}>{s || c.key}</option>
                    })}
                  </optgroup>
                ))}
              </select>
              <button className="btn small primary" disabled={!addKey} onClick={() => { set({ quickPicks: [...qp, addKey] }); setAddKey('') }}>加入</button>
            </div>
          </div>

          </>)}

          {editMode === 'income' && (<>
          <h3 className="pref-h">收入預設值</h3>
          <AccountSelect label="預設入帳帳戶" value={P.incomeTo} onChange={(v) => v && set({ incomeTo: v })} groups={[G.banks, G.wallets, G.fx]} hidden={hidden} />
          <label className="toggle-row">
            <span>記住上次用的入帳帳戶<br /><span className="muted tiny">開啟後，新的一筆收入會沿用上次的入帳帳戶</span></span>
            <input type="checkbox" className="switch" checked={P.rememberLastIncome} onChange={(e) => set({ rememberLastIncome: e.target.checked })} />
          </label>
          <div className="two-col">
            <label className="field">
              <span className="field-label">預設收入分類</span>
              <select value={P.incomeCat} onChange={(e) => set({ incomeCat: e.target.value, incomeSub: '' })}>
                {INCOME_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.emoji} {c.key}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="field-label">預設子分類</span>
              <select value={P.incomeSub} onChange={(e) => set({ incomeSub: e.target.value })} disabled={!incDef?.subs.length}>
                <option value="">（不指定）</option>
                {(incDef?.subs ?? []).map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
          </div>
          </>)}

          {editMode === 'transfer' && (<>
          <h3 className="pref-h">轉帳預設值</h3>
          <div className="two-col">
            <AccountSelect label="預設轉出" value={P.transferFrom} onChange={(v) => v && set({ transferFrom: v })} groups={[G.banks, G.wallets, G.fx, G.brokers]} hidden={hidden} />
            <AccountSelect label="預設轉入" value={P.transferTo} onChange={(v) => v && set({ transferTo: v })} groups={[G.banks, G.wallets, G.cards, G.fx, G.brokers, G.loans]} hidden={hidden} />
          </div>
          <span className="muted tiny">轉入選信用卡時，會自動記成「繳卡費」。</span>

          </>)}

          {editMode === 'withdraw' && (<>
          <h3 className="pref-h">領現預設值</h3>
          <div className="two-col">
            <AccountSelect label="預設從" value={P.withdrawFrom} onChange={(v) => v && set({ withdrawFrom: v })} groups={[G.banks]} hidden={hidden} />
            <AccountSelect label="預設放進" value={P.withdrawTo} onChange={(v) => v && set({ withdrawTo: v })} groups={[G.wallets]} hidden={hidden} />
          </div>
          <span className="muted tiny">領現會記成轉帳（銀行 → 現金），不算支出。</span>
          </>)}

          <div className="list-actions">
            <span className="muted tiny">設定會跟著雲端同步到其他裝置。</span>
            <button className="btn ghost small" onClick={reset}>恢復預設</button>
          </div>
        </div>
      )}
    </section>
  )
}
