import { useMemo, useState } from 'react'
import type { Account, CatDef, Tx } from '../types'
import { INCOME_CATEGORIES, TRANSFER_CATEGORIES, isFx } from '../types'
import { useStore } from '../store'
import { budgetAlert, cashWallet, defaultIncomeTo, defaultPayId, defaultSubFor, money, projectList, quickPickOf, resolvePrefs, todayStr } from '../logic'
import { Segmented, Sheet } from './ui'
import { IconChevron, IconChevronL, IconStar } from './icons'
import { emitBurst } from './Burst'

type Mode = 'expense' | 'income' | 'transfer' | 'withdraw'

function modeOf(t?: Tx): Mode {
  if (!t) return 'expense'
  if (t.type === 'transfer' && t.tag === 'withdraw') return 'withdraw'
  return t.type
}

function Chip({ a, on, onClick, star }: { a: Account; on: boolean; onClick: () => void; star?: boolean }) {
  return (
    <button type="button" className={`chip ${on ? 'on' : ''}`} onClick={onClick}>
      <span className="chip-dot" style={{ background: a.color ?? '#8E8E93' }} />
      {a.name}
      {star && <IconStar className="star" />}
    </button>
  )
}

const ADD_SUB = '__add__'
/** 子分類：單行下拉，＋自訂 放在選單裡 */
function SubSelect({ def, value, onChange, onAdd }: { def?: CatDef; value: string; onChange: (v: string) => void; onAdd?: () => void }) {
  const subs = def?.subs ?? []
  const extra = value && !subs.includes(value) ? [value] : []
  if (!subs.length && !extra.length && !onAdd) return null
  return (
    <label className="inline-field">
      <span className="field-label">子分類</span>
      <select
        value={value}
        onChange={(e) => (e.target.value === ADD_SUB ? onAdd?.() : onChange(e.target.value))}
        aria-label="子分類"
      >
        <option value="">（不指定）</option>
        {[...subs, ...extra].map((s) => <option key={s} value={s}>{s}</option>)}
        {onAdd && <option value={ADD_SUB}>＋ 自訂子分類…</option>}
      </select>
    </label>
  )
}

/** 依類型分組的帳戶下拉 */
export function AccountSelect({ value, onChange, groups, label, placeholder, hidden: _hidden, inline }: {
  value: string
  onChange: (v: string) => void
  groups: [string, Account[]][]
  label: string
  placeholder?: string
  hidden?: boolean
  inline?: boolean
}) {
  const all = groups.flatMap(([, l]) => l)
  const inList = all.some((a) => a.id === value)
  // 記帳時只顯示帳戶名稱，不顯示餘額
  const opt = (a: Account) => (
    <option key={a.id} value={a.id}>{a.name}</option>
  )
  return (
    <label className={inline ? 'inline-field' : 'field'}>
      <span className="field-label">{label}</span>
      <select value={inList ? value : ''} onChange={(e) => onChange(e.target.value)} aria-label={label}>
        {(placeholder || !inList) && <option value="">{placeholder ?? '請選擇'}</option>}
        {groups.filter(([, l]) => l.length).map(([g, l]) => <optgroup key={g} label={g}>{l.map(opt)}</optgroup>)}
      </select>
    </label>
  )
}

export function TxEditor({ open, onClose, editing, initialDate }: { open: boolean; onClose: () => void; editing?: Tx; initialDate?: string }) {
  if (!open) return null
  if (editing && (editing.trade || editing.tag === 'collect')) return <TxDetail key={editing.id} t={editing} onClose={onClose} />
  return <TxEditorInner key={editing?.id ?? `new-${initialDate ?? ''}`} onClose={onClose} editing={editing} initialDate={initialDate} />
}

function TxEditorInner({ onClose, editing, initialDate }: { onClose: () => void; editing?: Tx; initialDate?: string }) {
  const { state, addTx, updateTx, deleteTx, flash, hidden, expCats: allCats, pickCats: expCats, addCustomCat, addCustomSub, setPrefs, addRecur, runRecur } = useStore()
  const P = useMemo(() => resolvePrefs(state), [state])
  const accs = state.accounts
  const cards = accs.filter((a) => a.kind === 'card')
  const cash = cashWallet(accs)
  const wallets = accs.filter((a) => a.kind === 'cash' && a.id !== cash?.id)
  const banks = accs.filter((a) => a.kind === 'bank')
  const twdBanks = banks.filter((b) => !isFx(b))
  const loans = accs.filter((a) => a.kind === 'loan')
  const brokers = accs.filter((a) => a.kind === 'broker')
  const projects = useMemo(() => projectList(state).map((p) => p.project), [state])

  const [mode, setMode] = useState<Mode>(editing ? modeOf(editing) : P.defaultMode)
  const [amount, setAmount] = useState(editing ? String(editing.amount) : '')
  const [category, setCategory] = useState(editing?.type === 'expense' ? editing.category ?? '餐飲食品' : P.category)
  const [incomeCat, setIncomeCat] = useState(editing?.type === 'income' ? editing.category ?? '公司薪資' : P.incomeCat)
  const [transferCat, setTransferCat] = useState(editing?.type === 'transfer' && editing.tag !== 'withdraw' ? editing.category ?? '一般轉帳' : '一般轉帳')
  const [sub, setSub] = useState(editing ? editing.sub ?? '' : defaultSubFor(P, P.defaultMode, P.category, P.incomeCat))
  const [project, setProject] = useState(editing?.project ?? '')
  const [fromId, setFromId] = useState(editing?.type === 'expense' ? editing.fromId ?? '' : defaultPayId(P))
  const [toId, setToId] = useState(editing?.type === 'income' ? editing.toId ?? P.incomeTo : defaultIncomeTo(P))
  const [tFrom, setTFrom] = useState(editing?.type === 'transfer' && editing.tag !== 'withdraw' ? editing.fromId ?? '' : P.transferFrom)
  const [tTo, setTTo] = useState(editing?.type === 'transfer' && editing.tag !== 'withdraw' ? editing.toId ?? '' : P.transferTo)
  const [wFrom, setWFrom] = useState(editing?.tag === 'withdraw' ? editing.fromId ?? P.withdrawFrom : P.withdrawFrom)
  const [wTo, setWTo] = useState(editing?.tag === 'withdraw' ? editing.toId ?? P.withdrawTo : P.withdrawTo)
  const [moreCats, setMoreCats] = useState(false)
  /** 手機輸入友善：分類、其他帳戶、更多（日期／分帳／備註）預設收合 */
  const [catOpen, setCatOpen] = useState(!!editing)
  const [otherOpen, setOtherOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(!!editing)
  const [date, setDate] = useState(editing?.date ?? initialDate ?? todayStr())
  /** 單次或週期性（只對新增的支出有效） */
  const [freq, setFreq] = useState<'once' | 'week' | 'month' | 'year'>('once')
  const stepDay = (n: number) => {
    const [y, m, d] = date.split('-').map(Number)
    setDate(new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10))
  }
  const weekday = ['日', '一', '二', '三', '四', '五', '六'][new Date(`${date}T00:00:00Z`).getUTCDay()]
  const [note, setNote] = useState(editing?.note ?? '')
  // 分帳
  const [splitOn, setSplitOn] = useState(!!editing?.share)
  const [mine, setMine] = useState(editing?.share ? String(editing.share.mine) : '')
  const [parts, setParts] = useState<{ name: string; amount: string }[]>(
    editing?.share ? editing.share.parts.map((p) => ({ name: p.name, amount: String(p.amount) })) : [{ name: '', amount: '' }],
  )
  const friends = useMemo(() => [...new Set(state.receivables.map((r) => r.friend))], [state.receivables])
  const lockedShare = !!editing && state.receivables.some((r) => r.txId === editing.id && r.collectedBy)

  const switchMode = (m: Mode) => {
    setMode(m)
    setSub(defaultSubFor(P, m, category, incomeCat))
    if (m === 'withdraw' && !amount) setAmount('5000')
  }

  const amt = Math.round(Number(amount.replace(/,/g, '')) || 0)
  const target = useMemo(() => accs.find((a) => a.id === tTo), [accs, tTo])

  const mineAmt = Math.round(Number(mine) || 0)
  const partAmts = parts.map((p) => Math.round(Number(p.amount) || 0))
  const splitDiff = amt - mineAmt - partAmts.reduce((x, y) => x + y, 0)
  const evenSplit = () => {
    const n = parts.length + 1
    const each = Math.floor(amt / n)
    setMine(String(amt - each * parts.length))
    setParts(parts.map((p) => ({ ...p, amount: String(each) })))
  }

  const save = () => {
    if (amt <= 0) return flash('請輸入金額')
    if (lockedShare) return flash('這筆分帳已有朋友還款，請先刪除對應的「收回代墊」紀錄再修改')
    const common = { amount: amt, date, note: note.trim(), sub: sub || undefined, project: project.trim() || undefined }
    let tx: Omit<Tx, 'id'>
    if (mode === 'expense') {
      if (!fromId) return flash('請選擇付款方式')
      let share: Tx['share']
      if (splitOn) {
        if (splitDiff !== 0) return flash(`分帳金額不平衡：還差 ${money(splitDiff)}`)
        const ps = parts.map((p, i) => ({ name: p.name.trim() || `朋友${i + 1}`, amount: partAmts[i] })).filter((p) => p.amount > 0)
        if (!ps.length) return flash('請填入朋友的份額')
        share = { mine: mineAmt, parts: ps }
      }
      tx = { ...common, type: 'expense', category, fromId, share }
    } else if (mode === 'income') {
      tx = { ...common, type: 'income', category: incomeCat, toId }
    } else if (mode === 'transfer') {
      if (!tFrom || !tTo || tFrom === tTo) return flash('請選擇不同的轉出與轉入帳戶')
      const isCardPay = target?.kind === 'card'
      const cat = isCardPay ? '信用卡費' : transferCat
      const tag = isCardPay ? 'cardpay' : editing?.tag && editing.tag !== 'withdraw' && editing.tag !== 'cardpay' ? editing.tag : undefined
      tx = { ...common, type: 'transfer', fromId: tFrom, toId: tTo, category: cat, tag, note: common.note || (isCardPay ? '繳卡費' : '') }
    } else {
      if (!wFrom || !wTo) return flash('請選擇領現的帳戶')
      tx = { ...common, type: 'transfer', fromId: wFrom, toId: wTo, category: '領現', note: common.note || 'ATM 領現', tag: 'withdraw' }
    }
    if (editing) {
      updateTx(editing.id, { ...tx, id: editing.id, flowKey: editing.flowKey, groupId: editing.groupId, groupTitle: editing.groupTitle })
      flash('已更新紀錄')
    } else if (mode === 'expense' && freq !== 'once') {
      const { date: _date, ...tpl } = tx as Tx
      addRecur({ freq, start: date, tpl })
      runRecur()
      emitBurst('expense')
      onClose()
      flash(`已設定${freq === 'week' ? '每週' : freq === 'month' ? '每月' : '每年'}自動記帳 ${sub || category} ${money(amt, hidden)}`)
      return
    } else {
      const warn = mode === 'expense' ? budgetAlert(state, { category, sub: sub || undefined, amount: tx.share ? tx.share.mine : amt, date }) : ''
      addTx(tx)
      emitBurst(mode === 'expense' ? 'expense' : mode === 'income' ? 'income' : 'hope')
      if (mode === 'expense' && P.rememberLastPay && fromId !== P.lastPayId) setPrefs({ lastPayId: fromId })
      if (mode === 'income' && P.rememberLastIncome && toId !== P.lastIncomeTo) setPrefs({ lastIncomeTo: toId })
      flash(mode === 'expense' ? `已記下 ${sub || category} ${money(amt, hidden)}${warn ? `\n${warn}` : ''}` : '已新增紀錄')
    }
    onClose()
  }

  const remove = () => {
    if (!editing) return
    if (lockedShare) return flash('這筆分帳已有朋友還款，請先刪除對應的「收回代墊」紀錄')
    deleteTx(editing.id)
    flash('已刪除，餘額已回補')
    onClose()
  }

  const cashLike = [...(cash ? [cash] : []), ...wallets]
  const G = {
    cards: ['信用卡', cards] as [string, Account[]],
    wallets: ['現金與電子錢包', cashLike] as [string, Account[]],
    banks: ['銀行帳戶', twdBanks] as [string, Account[]],
    fx: ['外幣帳戶', banks.filter(isFx)] as [string, Account[]],
    brokers: ['證券交割戶', brokers] as [string, Account[]],
    loans: ['其他負債', loans] as [string, Account[]],
  }
  // 付款方式：快捷按鈕＝最愛＋目前預設；其他放進下拉
  const chipIds = [...new Set([...P.favAccounts, P.payId])].filter((id) => accs.some((a) => a.id === id))
  const chipAccs = chipIds.map((id) => accs.find((a) => a.id === id)!)
  const notChip = (l: Account[]) => l.filter((a) => !chipIds.includes(a.id))
  const payGroups: [string, Account[]][] = [['信用卡', notChip(cards)], ['電子錢包與現金', notChip(cashLike)], ['銀行帳戶', notChip(twdBanks)]]
  // 分類：最常用 5 個＋目前選的，其餘收在「更多」
  const usage = useMemo(() => {
    const m: Record<string, number> = {}
    for (const t of state.txs.slice(0, 600)) if (t.type === 'expense' && t.category) m[t.category] = (m[t.category] ?? 0) + 1
    return m
  }, [state.txs])
  const topCats = [...expCats].sort((a, b) => (usage[b.key] ?? 0) - (usage[a.key] ?? 0)).slice(0, 5)
  const shownCats = moreCats ? expCats : [...topCats, ...(topCats.some((c) => c.key === category) ? [] : allCats.filter((c) => c.key === category && !expCats.some((x) => x.key === category)).concat(expCats.filter((c) => c.key === category)))]
  const quickPicks = P.quickPicks.map(quickPickOf).filter((q) => expCats.some((c) => c.key === q.cat && (!q.sub || c.subs.includes(q.sub))))
  const payAcc = accs.find((a) => a.id === fromId)

  const newCat = () => {
    const name = window.prompt('新增支出分類名稱（例如：寵物）')?.trim()
    if (!name) return
    addCustomCat(name.slice(0, 10))
    setCategory(name.slice(0, 10))
    setSub('')
  }
  const newSub = () => {
    const name = window.prompt(`在「${category}」新增子分類`)?.trim()
    if (!name) return
    addCustomSub(category, name.slice(0, 12))
    setSub(name.slice(0, 12))
  }

  const catGrid = (defs: CatDef[], value: string, onPick: (k: string) => void, onAdd?: () => void, more?: boolean) => (
    <div className="cat-grid">
      {defs.map((c) => (
        <button key={c.key} type="button" className={`cat ${value === c.key ? 'on' : ''}`} onClick={() => { onPick(c.key); setSub('') }}>
          <span className="cat-emoji">{c.emoji}</span>
          <span>{c.key}</span>
        </button>
      ))}
      {more && !moreCats && (
        <button type="button" className="cat add" onClick={() => setMoreCats(true)}>
          <span className="cat-emoji">⋯</span>
          <span>更多</span>
        </button>
      )}
      {onAdd && (!more || moreCats) && (
        <button type="button" className="cat add" onClick={onAdd}>
          <span className="cat-emoji">＋</span>
          <span>自訂分類</span>
        </button>
      )}
    </div>
  )

  return (
    <Sheet
      open
      onClose={onClose}
      title={editing ? '編輯紀錄' : '快速記帳'}
      footer={
        <div className="foot-row">
          {editing && <button className="btn danger ghost" onClick={remove}>刪除</button>}
          <button className="btn primary grow" onClick={save}>{editing ? '儲存變更' : '完成'}</button>
        </div>
      }
    >
      <Segmented<Mode>
        value={mode}
        onChange={switchMode}
        options={[
          { value: 'expense', label: '支出' },
          { value: 'income', label: '收入' },
          { value: 'transfer', label: '轉帳' },
          { value: 'withdraw', label: '領現' },
        ]}
      />
      <div className={`amount-input ${mode}`}>
        <span className="cur">NT$</span>
        <input
          inputMode="numeric"
          autoFocus={!editing}
          placeholder="0"
          value={amount ? Number(amount.replace(/,/g, '')).toLocaleString('zh-TW') : ''}
          onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, '').slice(0, 9))}
          aria-label="金額"
        />
      </div>

      {mode === 'expense' && !editing && (
        <>
          <div className="section-label">次數</div>
          <Segmented<'once' | 'week' | 'month' | 'year'>
            value={freq}
            onChange={setFreq}
            options={[
              { value: 'once', label: '單次' },
              { value: 'week', label: '每週' },
              { value: 'month', label: '每月' },
              { value: 'year', label: '每年' },
            ]}
          />
          {freq !== 'once' && <p className="hint">從「日期」那天開始，之後每{freq === 'week' ? '週' : freq === 'month' ? '月' : '年'}同一天自動記一筆；開啟 App 時會補記到今天，可在「設定」刪除規則。</p>}
        </>
      )}
      {mode === 'expense' && (
        <>
          {quickPicks.length > 0 && (
            <>
              <div className="section-label">常用項目</div>
              <div className="quick-row">
                {quickPicks.map((q) => (
                  <button
                    key={q.key}
                    type="button"
                    className={`quick ${category === q.cat && sub === q.sub ? 'on' : ''}`}
                    onClick={() => { setCategory(q.cat); setSub(q.sub) }}
                  >
                    <span>{q.emoji}</span>{q.label}
                  </button>
                ))}
              </div>
            </>
          )}
          <div className="section-label">付款方式</div>
          <div className="chip-row pay-row">
            {chipAccs.map((c) => <Chip key={c.id} a={c} on={fromId === c.id} onClick={() => setFromId(c.id)} star={P.favAccounts.includes(c.id)} />)}
          </div>
          {otherOpen || !chipIds.includes(fromId) ? (
            <AccountSelect
              inline
              label="其他"
              value={chipIds.includes(fromId) ? '' : fromId}
              onChange={(v) => v && setFromId(v)}
              groups={payGroups}
              placeholder="其他信用卡／錢包／銀行…"
              hidden={hidden}
            />
          ) : (
            <button type="button" className="row-pick" onClick={() => setOtherOpen(true)}>
              <span className="muted small">其他帳戶</span>
              <span className="row-pick-val" />
              <span className="chev-r">›</span>
            </button>
          )}
          <button type="button" className="row-pick" onClick={() => setCatOpen(!catOpen)} aria-expanded={catOpen}>
            <span className="muted small">分類</span>
            <span className="row-pick-val">{`${(expCats.find((c) => c.key === category) ?? allCats.find((c) => c.key === category))?.emoji ?? ''} ${category}${sub ? ` · ${sub}` : ''}`}</span>
            <span className="chev-r">{catOpen ? '⌃' : '›'}</span>
          </button>
          {catOpen && (
            <>
              {catGrid(shownCats, category, setCategory, newCat, true)}
              <SubSelect def={expCats.find((c) => c.key === category) ?? allCats.find((c) => c.key === category)} value={sub} onChange={setSub} onAdd={newSub} />
            </>
          )}
          <p className="info-line" title={payAcc?.kind === 'card' ? '刷卡：計入該卡未出帳金額與本月支出，等帳單扣款日才從銀行扣。' : '直接扣減該帳戶餘額並計入本月支出。'}>
            ⓘ {payAcc?.kind === 'card' ? `刷 ${payAcc.name}：記入未出帳，不扣銀行` : `直接從 ${payAcc?.name ?? '帳戶'} 扣款`}
            {category === '代墊款' && '・幫朋友付建議用「分帳」'}
          </p>
        </>
      )}

      {mode === 'income' && (
        <>
          <AccountSelect label="入帳帳戶" value={toId} onChange={setToId} groups={[G.banks, G.wallets, G.fx]} hidden={hidden} />
          <div className="section-label">類別</div>
          {catGrid(INCOME_CATEGORIES, incomeCat, setIncomeCat)}
          <SubSelect def={INCOME_CATEGORIES.find((c) => c.key === incomeCat)} value={sub} onChange={setSub} />
        </>
      )}

      {mode === 'transfer' && (
        <>
          <div className="two-col">
            <AccountSelect label="轉出帳戶" value={tFrom} onChange={setTFrom} groups={[G.banks, G.wallets, G.fx, G.brokers]} hidden={hidden} />
            <AccountSelect label="轉入帳戶／繳卡費" value={tTo} onChange={setTTo} groups={[G.banks, G.wallets, G.cards, G.fx, G.brokers, G.loans]} hidden={hidden} />
          </div>
          <div className="section-label">轉帳類別</div>
          <div className="chip-row">
            {TRANSFER_CATEGORIES.filter((c) => ['一般轉帳', '信用卡費', '投資'].includes(c.key)).map((c) => (
              <button
                key={c.key}
                type="button"
                className={`chip ${(target?.kind === 'card' ? '信用卡費' : transferCat) === c.key ? 'on' : ''}`}
                onClick={() => { setTransferCat(c.key); setSub('') }}
              >
                {c.emoji} {c.key}
              </button>
            ))}
          </div>
          {transferCat === '投資' && target?.kind !== 'card' && <SubSelect def={TRANSFER_CATEGORIES.find((c) => c.key === '投資')} value={sub} onChange={setSub} />}
          <p className="info-line">ⓘ {target?.kind === 'card' ? `繳卡費：沖銷 ${target.name} 應繳，不重複算支出` : '帳戶互轉不計入收支'}</p>
        </>
      )}

      {mode === 'withdraw' && (
        <>
          <div className="two-col">
            <AccountSelect label="從哪個帳戶領" value={wFrom} onChange={setWFrom} groups={[G.banks]} hidden={hidden} />
            <AccountSelect label="放進" value={wTo} onChange={setWTo} groups={[G.wallets]} hidden={hidden} />
          </div>
          <div className="chip-row">
            {[1000, 2000, 3000, 5000].map((v) => (
              <button key={v} type="button" className={`chip ${amt === v ? 'on' : ''}`} onClick={() => setAmount(String(v))}>NT$ {v.toLocaleString()}</button>
            ))}
          </div>
          <p className="info-line">ⓘ 領現不算支出，計入本月領現額度</p>
        </>
      )}

      {mode === 'expense' && !moreOpen && (
        <button type="button" className="row-pick" onClick={() => setMoreOpen(true)}>
          <span className="row-pick-val">更多：日期、分帳、備註</span>
          <span className="chev-r">›</span>
        </button>
      )}
      {(mode !== 'expense' || moreOpen) && (
        <>
          {mode === 'expense' && (
            <>
            <label className="toggle-row">
              <span>🤝 分帳（我先付，朋友之後還）</span>
              <input type="checkbox" className="switch" checked={splitOn} onChange={(e) => { setSplitOn(e.target.checked); if (e.target.checked && !mine && amt) evenSplit() }} />
            </label>
            {splitOn && (
              <div className="split-box">
                <div className="split-row">
                  <span className="split-name strong">我的份額</span>
                  <input className="split-amt" inputMode="numeric" value={mine} onChange={(e) => setMine(e.target.value.replace(/\D/g, ''))} placeholder="0" />
                </div>
                {parts.map((p, i) => (
                  <div key={i} className="split-row">
                    <input className="split-name" list="friend-list" placeholder={`朋友 ${i + 1}`} value={p.name} onChange={(e) => setParts(parts.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                    <input className="split-amt" inputMode="numeric" placeholder="0" value={p.amount} onChange={(e) => setParts(parts.map((x, j) => (j === i ? { ...x, amount: e.target.value.replace(/\D/g, '') } : x)))} />
                    {parts.length > 1 && <button type="button" className="icon-btn" aria-label="移除" onClick={() => setParts(parts.filter((_, j) => j !== i))}>×</button>}
                  </div>
                ))}
                <datalist id="friend-list">{friends.map((f) => <option key={f} value={f} />)}</datalist>
                <div className="split-actions">
                  <button type="button" className="chip small" onClick={() => setParts([...parts, { name: '', amount: '' }])}>＋ 加朋友</button>
                  <button type="button" className="chip small" disabled={!amt} onClick={evenSplit}>平均分攤</button>
                  <span className={`small ${splitDiff ? 'warn' : 'pos'}`}>{splitDiff ? `還差 ${money(splitDiff, hidden)}` : '✓ 金額已平衡'}</span>
                </div>
                <p className="hint">付款工具扣總額 {money(amt, hidden)}；只有我的份額算進「{category}」，朋友的部分記成待收代墊（資產），不算支出。</p>
                {lockedShare && <p className="small warn">已有朋友還款，分帳內容暫時鎖定。</p>}
              </div>
            )}
            </>
          )}
        <div className="two-col">
          <div className="field">
            <span className="field-label">日期</span>
            <div className="date-step">
              <button type="button" className="icon-btn" onClick={() => stepDay(-1)} aria-label="前一天"><IconChevronL size={18} /></button>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              <span className="small muted">週{weekday}</span>
              <button type="button" className="icon-btn" onClick={() => stepDay(1)} aria-label="後一天"><IconChevron size={18} /></button>
            </div>
          </div>
          <label className="field">
            <span className="field-label">專案標籤（選填）</span>
            <input list="project-list" placeholder={projects.length ? '輸入或選擇現有標籤' : '例如：2026 花蓮'} value={project} onChange={(e) => setProject(e.target.value)} maxLength={30} />
            <datalist id="project-list">{projects.map((p) => <option key={p} value={p} />)}</datalist>
          </label>
        </div>
        <label className="field">
          <span className="field-label">備註</span>
          <input placeholder="例如：蜜粉、朋友生日" value={note} onChange={(e) => setNote(e.target.value)} maxLength={60} />
        </label>
        </>
      )}
    </Sheet>
  )
}

/** 證券交易／收回代墊：顯示明細，可刪除（會自動回補） */
function TxDetail({ t, onClose }: { t: Tx; onClose: () => void }) {
  const { state, deleteTx, flash, hidden } = useStore()
  const tr = t.trade
  const broker = tr ? state.accounts.find((a) => a.id === tr.brokerId) : undefined
  const to = state.accounts.find((a) => a.id === t.toId)
  const rows: [string, string][] = tr
    ? tr.kind === 'dividend'
      ? [['類型', '配息'], ['證券戶', broker?.name ?? '—'], ['標的', `${tr.symbol} ${tr.name}`], ['金額', money(t.amount, hidden)], ['日期', t.date]]
      : [
          ['類型', tr.kind === 'buy' ? '買進' : '賣出'], ['證券戶', broker?.name ?? '—'], ['標的', `${tr.symbol} ${tr.name}`],
          ['股數', tr.shares.toLocaleString()], ['成交價', String(tr.price)], ['手續費／稅', money(tr.fee, hidden)],
          [tr.kind === 'buy' ? '交割金額（含費）' : '入帳金額（扣費）', money(t.amount, hidden)], ['日期', t.date],
          ...(tr.kind === 'sell' && tr.costAtSell !== undefined ? [['已實現損益', money(tr.shares * (tr.price - tr.costAtSell) - tr.fee, hidden, { sign: true })] as [string, string]] : []),
        ]
    : [
        ['類型', '收回代墊'], ['入帳', to?.name ?? '—'], ['金額', money(t.amount, hidden)], ['日期', t.date],
        ['沖銷', state.receivables.filter((r) => t.receivableIds?.includes(r.id)).map((r) => `${r.friend} ${money(r.amount, hidden)}`).join('、') || '—'],
      ]
  return (
    <Sheet
      open
      onClose={onClose}
      title={tr ? '證券交易' : '收回代墊'}
      footer={
        <button
          className="btn danger ghost grow"
          style={{ width: '100%' }}
          onClick={() => {
            deleteTx(t.id)
            flash('已刪除並回補')
            onClose()
          }}
        >
          刪除這筆
        </button>
      }
    >
      <div className="kv-list">
        {rows.map(([k, v]) => (
          <div key={k} className="row-split"><span className="muted small">{k}</span><span className="num">{v}</span></div>
        ))}
      </div>
      {t.note && <p className="hint">{t.note}</p>}
    </Sheet>
  )
}
