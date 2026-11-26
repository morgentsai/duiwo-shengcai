import { useMemo, useState } from 'react'
import type { Tx } from '../types'
import { useStore } from '../store'
import { byId, dateLabel, monthLabel, monthOf, monthStats, projectList, shiftMonth, thisMonth, todayStr } from '../logic'
import type { StatMode } from '../logic'
import { MonthCalendar, useDayTotals } from '../components/Calendar'
import { catMeta } from '../types'
import { Money, Segmented } from '../components/ui'
import { TxGroupRow, TxRow } from '../components/TxRow'
import { IconChevron, IconChevronL, IconSearch } from '../components/icons'

type F = 'all' | 'expense' | 'income' | 'transfer'

export function Transactions({ onOpenTx, onNewTx, initialProject }: { onOpenTx: (t: Tx) => void; onNewTx: (date: string) => void; initialProject?: string }) {
  const { state } = useStore()
  const [project, setProject] = useState(initialProject ?? '')
  const projects = useMemo(() => projectList(state), [state])
  const proj = projects.find((p) => p.project === project)
  const [month, setMonth] = useState(thisMonth())
  const [q, setQ] = useState('')
  const [type, setType] = useState<F>('all')
  const [acc, setAcc] = useState('')
  const [hideInternal, setHideInternal] = useState(false)
  const [view, setView] = useState<'list' | 'cal'>(() => (localStorage.getItem('mw-tx-view') === 'cal' ? 'cal' : 'list'))
  const [calMode, setCalMode] = useState<StatMode>('spend')
  const [selDay, setSelDay] = useState(todayStr())
  const dayTotals = useDayTotals(calMode)
  const switchView = (v: 'list' | 'cal') => { setView(v); localStorage.setItem('mw-tx-view', v) }
  const changeMonth = (m: string) => {
    setMonth(m)
    const t = todayStr()
    setSelDay(t.startsWith(m) ? t : `${m}-01`)
  }

  const list = useMemo(() => {
    const kw = q.trim().toLowerCase()
    return state.txs
      .filter((t) => (project ? t.project === project : monthOf(t.date) === month))
      .filter((t) => type === 'all' || t.type === type)
      .filter((t) => !acc || t.fromId === acc || t.toId === acc || t.trade?.brokerId === acc)
      .filter((t) => !hideInternal || t.type !== 'transfer')
      .filter((t) => {
        if (!kw) return true
        const hay = [t.note, t.category, t.sub, t.project, byId(state, t.fromId)?.name, byId(state, t.toId)?.name, String(t.amount)].join(' ').toLowerCase()
        return hay.includes(kw)
      })
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  }, [state, month, q, type, acc, project, hideInternal])

  /** 依日期分組；同一轉帳群組只在最新日期出現一次（折疊） */
  type Item = { kind: 'tx'; t: Tx } | { kind: 'group'; id: string; title: string; txs: Tx[] }
  const groups = useMemo(() => {
    const byGroup = new Map<string, Tx[]>()
    for (const t of list) if (t.groupId) byGroup.set(t.groupId, [...(byGroup.get(t.groupId) ?? []), t])
    const seen = new Set<string>()
    const m = new Map<string, Item[]>()
    for (const t of list) {
      let item: Item | null = { kind: 'tx', t }
      if (t.groupId && (byGroup.get(t.groupId)?.length ?? 0) > 1) {
        if (seen.has(t.groupId)) item = null
        else {
          seen.add(t.groupId)
          item = { kind: 'group', id: t.groupId, title: t.groupTitle ?? '轉帳群組', txs: byGroup.get(t.groupId) ?? [] }
        }
      }
      if (item) m.set(t.date, [...(m.get(t.date) ?? []), item])
    }
    return [...m.entries()]
  }, [list])

  const st = monthStats(state, month, view === 'cal' ? calMode : 'spend')
  const selTxs = (dayTotals.get(selDay)?.txs ?? []).slice().sort((a, b) => (a.type === b.type ? 0 : a.type === 'expense' ? -1 : 1))
  const selTot = dayTotals.get(selDay)
  const isCur = month >= thisMonth()

  return (
    <div className="page">
      {!proj ? (
        <>
          <Segmented<'list' | 'cal'>
            value={view}
            onChange={switchView}
            options={[
              { value: 'list', label: '☰ 列表' },
              { value: 'cal', label: '📅 月曆' },
            ]}
          />
          <div className="month-switch">
            <button className="icon-btn" onClick={() => changeMonth(shiftMonth(month, -1))} aria-label="上個月"><IconChevronL size={20} /></button>
            <span className="month-title">{view === 'cal' ? month : monthLabel(month)}</span>
            <button className="icon-btn" disabled={isCur} onClick={() => changeMonth(shiftMonth(month, 1))} aria-label="下個月"><IconChevron size={20} /></button>
          </div>
          <section className="card io-strip">
            <div><span className="muted small">收入</span><Money v={st.income} className="pos strong" /></div>
            <div><span className="muted small">支出</span><Money v={st.expense} className="strong" /></div>
            <div><span className="muted small">結餘</span><Money v={st.net} className={`strong ${st.net < 0 ? 'neg' : ''}`} /></div>
          </section>
        </>
      ) : (
        <section className="card proj-card">
          <div className="card-head">
            <div>
              <h2>🏷️ {proj.project}</h2>
              <p className="muted small">{proj.first.replace(/-/g, '/')} – {proj.last.replace(/-/g, '/')} · {proj.count} 筆</p>
            </div>
            <button className="btn small ghost" onClick={() => setProject('')}>取消專案</button>
          </div>
          <div className="io-strip">
            <div><span className="muted small">專案總花費</span><Money v={proj.expense} className="strong" /></div>
            <div><span className="muted small">收回／收入</span><Money v={proj.income} className="pos strong" /></div>
            <div><span className="muted small">淨花費</span><Money v={proj.expense - proj.income} className="strong" /></div>
          </div>
          <div className="proj-cats">
            {Object.entries(proj.byCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
              <span key={k} className="mini-tag">{catMeta(k).emoji} {k} <Money v={v} /></span>
            ))}
          </div>
        </section>
      )}

      {view === 'cal' && !proj && (
        <>
          <section className="card cal-card">
            <MonthCalendar month={month} selected={selDay} onSelect={(d) => { if (!d.startsWith(month)) setMonth(d.slice(0, 7)); setSelDay(d) }} days={dayTotals} />
            <div className="cal-foot">
              <Segmented<StatMode>
                value={calMode}
                onChange={setCalMode}
                options={[
                  { value: 'spend', label: '消費（刷卡日）' },
                  { value: 'cash', label: '實際扣款日' },
                ]}
              />
              <p className="muted tiny">綠＝收入、紅＝支出；轉帳不計，分帳只算我的份額。</p>
            </div>
          </section>
          <section className="card list-card">
            <div className="day-head">
              <span>{dateLabel(selDay)}</span>
              <span className="small">
                {selTot?.inc ? <span className="pos">收入 <Money v={selTot.inc} />　</span> : null}
                {selTot?.exp ? <span className="neg">支出 <Money v={selTot.exp} /></span> : null}
              </span>
            </div>
            {selTxs.map((t) => <TxRow key={t.id} t={t} onClick={() => onOpenTx(t)} />)}
            {calMode === 'cash' && selTxs.some((t) => t.type === 'expense' && t.date !== selDay) && <p className="muted tiny pad-x">實際扣款日檢視：信用卡消費顯示在帳單扣款這天。</p>}
            <button className="row add-row" onClick={() => onNewTx(selDay)}>
              <span className="add-plus">＋</span>
              <span className="row-main"><span className="row-title">新增一筆…</span><span className="row-sub">日期會預設為 {selDay.slice(5).replace('-', '/')}</span></span>
            </button>
          </section>
        </>
      )}

      {view === 'list' || proj ? (<>
      <div className="filters">
        <label className="search">
          <IconSearch />
          <input placeholder="搜尋備註、分類、帳戶、金額" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <div className="filter-row">
          <Segmented<F>
            value={type}
            onChange={setType}
            options={[
              { value: 'all', label: '全部' },
              { value: 'expense', label: '支出' },
              { value: 'income', label: '收入' },
              { value: 'transfer', label: '轉帳' },
            ]}
          />
          {projects.length > 0 && (
            <select className="acc-filter" value={project} onChange={(e) => setProject(e.target.value)} aria-label="專案篩選">
              <option value="">所有專案</option>
              {projects.map((p) => <option key={p.project} value={p.project}>🏷️ {p.project}</option>)}
            </select>
          )}
          <select className="acc-filter" value={acc} onChange={(e) => setAcc(e.target.value)} aria-label="帳戶篩選">
            <option value="">所有帳戶</option>
            {state.accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          <button type="button" className={`chip small ${hideInternal ? 'on' : ''}`} onClick={() => setHideInternal(!hideInternal)}>
            {hideInternal ? '✓ ' : ''}隱藏內部轉帳
          </button>
        </div>
      </div>

      {groups.length === 0 && <p className="empty card">{project ? '這個專案沒有符合條件的紀錄。' : '這個月沒有符合條件的紀錄。'}</p>}
      {groups.map(([date, items]) => {
        const out = items.reduce((x, it) => x + (it.kind === 'tx' && it.t.type === 'expense' ? (it.t.share ? it.t.share.mine : it.t.amount) : 0), 0)
        return (
          <section key={date} className="card list-card">
            <div className="day-head">
              <span>{dateLabel(date)}</span>
              {out > 0 && <span className="muted small">支出 <Money v={out} /></span>}
            </div>
            {items.map((it) =>
              it.kind === 'tx' ? <TxRow key={it.t.id} t={it.t} onClick={() => onOpenTx(it.t)} /> : <TxGroupRow key={it.id} title={it.title} txs={it.txs} onOpenTx={onOpenTx} />,
            )}
          </section>
        )
      })}
      <p className="foot-note">共 {list.length} 筆 · 點任一筆可編輯或刪除，餘額會自動重算</p>
      </>) : null}
    </div>
  )
}
