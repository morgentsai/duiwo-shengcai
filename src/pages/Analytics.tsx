import { useMemo, useState } from 'react'
import type { ExpDim, StatMode, TxKind } from '../logic'
import type { GroupKey } from '../types'
import { GROUP_META, catMeta } from '../types'
import { useStore } from '../store'
import { BudgetFull } from '../components/Budget'
import { rankBy, monthLabel, rangeStats, netWorthHistory, projectList, shiftMonth, thisMonth, todayStr } from '../logic'
import { Money, Segmented } from '../components/ui'
import { Donut, IOChart, TotalOverview, NetWorthChart, RankBars, TrendChart } from '../components/charts'
import { IconChevron, IconChevronL } from '../components/icons'

type Unit = 'year' | 'month' | 'week' | 'custom'
const addDays = (d: string, n: number) => {
  const [y, m, dd] = d.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10)
}
/** 週一為一週的第一天 */
const mondayOf = (d: string) => {
  const [y, m, dd] = d.split('-').map(Number)
  const wd = new Date(Date.UTC(y, m - 1, dd)).getUTCDay()
  return addDays(d, -((wd + 6) % 7))
}
const DIM_LABEL: Record<ExpDim, string> = { cat: '分類', project: '專案', account: '帳戶' }
const lastDayOf = (m: string) => `${m}-${String(new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).getUTCDate()).padStart(2, '0')}`

export function Analytics({ onOpenProject }: { onOpenProject: (p: string) => void }) {
  const s = useStore()
  const { state } = s
  const cur = thisMonth()
  const today = todayStr()
  const [unit, setUnit] = useState<Unit>('month')
  const [anchor, setAnchor] = useState(today)
  const [kind, setKind] = useState<TxKind>('all')
  const [mode, setMode] = useState<StatMode>('spend')
  const [byGroup, setByGroup] = useState<'cat' | 'group'>('cat')
  const [dim, setDim] = useState<ExpDim>('cat')
  const [cStart, setCStart] = useState(`${shiftMonth(cur, -2)}-01`)
  const [cEnd, setCEnd] = useState(todayStr())
  const year = anchor.slice(0, 4)
  const [start, end] =
    unit === 'month' ? [`${anchor.slice(0, 7)}-01`, lastDayOf(anchor.slice(0, 7))]
    : unit === 'year' ? [`${year}-01-01`, `${year}-12-31`]
    : unit === 'week' ? [mondayOf(anchor), addDays(mondayOf(anchor), 6)]
    : cStart <= cEnd ? [cStart, cEnd] : [cEnd, cStart]
  const single = unit === 'month'
  const step = (dir: 1 | -1) =>
    setAnchor(
      unit === 'year' ? `${Number(year) + dir}-01-01`
      : unit === 'month' ? `${shiftMonth(anchor.slice(0, 7), dir)}-01`
      : addDays(mondayOf(anchor), dir * 7),
    )
  const atLatest = unit === 'custom' || end >= today
  const periodLabel =
    unit === 'year' ? year
    : unit === 'month' ? start.slice(0, 7)
    : `${start} – ${end.slice(5)}`
  const quick = (k: 'this' | 'last' | 'year' | 'week') => {
    if (k === 'this') { setUnit('month'); setAnchor(today) }
    if (k === 'last') { setUnit('month'); setAnchor(`${shiftMonth(cur, -1)}-01`) }
    if (k === 'year') { setUnit('year'); setAnchor(today) }
    if (k === 'week') { setUnit('week'); setAnchor(today) }
  }
  const quickOn = unit === 'month' && start.slice(0, 7) === cur ? 'this'
    : unit === 'month' && start.slice(0, 7) === shiftMonth(cur, -1) ? 'last'
    : unit === 'year' && year === cur.slice(0, 4) ? 'year'
    : unit === 'week' && start === mondayOf(today) ? 'week' : ''
  const month = start.slice(0, 7)
  const R = useMemo(() => rangeStats(state, start, end, mode), [state, start, end, mode])
  const rankedExp = useMemo(() => rankBy(state, start, end, dim, 'expense'), [state, start, end, dim])
  const rankedInc = useMemo(() => rankBy(state, start, end, dim, 'income'), [state, start, end, dim])
  const hist = netWorthHistory(state, 6)
  const rangeLabel = unit === 'year' ? `${year} 年` : single ? monthLabel(month) : unit === 'week' ? `週 ${start.slice(5).replace('-', '/')}（一）– ${end.slice(5).replace('-', '/')}（日）` : `${start.replace(/-/g, '/')} – ${end.replace(/-/g, '/')}`
  const showExp = kind === 'all' || kind === 'expense'
  const showInc = kind === 'all' || kind === 'income'
  const keys = (kind === 'all' ? ['income', 'expense', 'invest'] : kind === 'income' ? ['income'] : ['expense']) as ('income' | 'expense' | 'invest')[]
  const expData = dim === 'cat' ? { cats: R.expCats, total: R.expense } : rankedExp
  const incData = dim === 'cat' ? { cats: R.incCats, total: R.income } : rankedInc

  return (
    <div className="page">
      <section className="card filter-card">
        <Segmented<Unit>
          value={unit}
          onChange={(u) => { setUnit(u); if (u !== 'custom') setAnchor(end < today ? end : today) }}
          options={[
            { value: 'year', label: '年' },
            { value: 'month', label: '月' },
            { value: 'week', label: '週' },
            { value: 'custom', label: '自訂區間' },
          ]}
        />
        {unit !== 'custom' ? (
          <div className="period-step">
            <button className="icon-btn" onClick={() => step(-1)} aria-label="上一期"><IconChevronL size={20} /></button>
            <span className="period-label num">{periodLabel}</span>
            <button className="icon-btn" disabled={atLatest} onClick={() => step(1)} aria-label="下一期"><IconChevron size={20} /></button>
          </div>
        ) : (
          <div className="two-col">
            <label className="field"><span className="field-label">開始</span><input type="date" value={cStart} onChange={(e) => setCStart(e.target.value)} /></label>
            <label className="field"><span className="field-label">結束</span><input type="date" value={cEnd} onChange={(e) => setCEnd(e.target.value)} /></label>
          </div>
        )}
        <div className="year-pick quick">
          {([['this', '本月'], ['last', '上月'], ['year', '年度'], ['week', '本週']] as const).map(([k, l]) => (
            <button key={k} className={`chip ${quickOn === k ? 'on' : ''}`} onClick={() => quick(k)}>{l}</button>
          ))}
        </div>
        <Segmented<TxKind>
          value={kind}
          onChange={setKind}
          options={[
            { value: 'all', label: '全部' },
            { value: 'expense', label: '支出' },
            { value: 'income', label: '收入' },
          ]}
        />
        {kind !== 'income' && (
          <Segmented<StatMode>
            value={mode}
            onChange={setMode}
            options={[
              { value: 'spend', label: '消費（刷卡日）' },
              { value: 'cash', label: '實際扣款（現金流）' },
            ]}
          />
        )}
      </section>

      {kind === 'all' && (
        <section className="card">
          <div className="card-head"><h2>總計</h2><span className="muted small">{rangeLabel}</span></div>
          <TotalOverview income={R.income} expense={R.expense} onPick={setKind} />
        </section>
      )}

      <section className="card">
        <div className="card-head"><h2>{rangeLabel}</h2><span className="muted small">{R.days} 天 · {R.nExp + R.nInc} 筆</span></div>
        <div className="mode-sum">
          {showInc && <div><span className="muted small">收入 · {R.nInc} 筆</span><Money v={R.income} className="strong pos" /></div>}
          {showExp && <div><span className="muted small">{mode === 'spend' ? '支出' : '實際流出'} · {R.nExp} 筆</span><Money v={R.expense} className="strong" /></div>}
          {kind === 'all' && <div><span className="muted small">結餘</span><Money v={R.net} sign className={`strong ${R.net >= 0 ? 'pos' : 'neg'}`} /></div>}
          {kind === 'all' && <div><span className="muted small">{GROUP_META.saving.emoji} 投資入金（儲蓄）</span><Money v={R.invest} className="strong pos" /></div>}
          {showExp && <div><span className="muted small">其中信用卡</span><Money v={R.card} /></div>}
        </div>
        <p className="hint">
          {mode === 'spend'
            ? '支出依刷卡／消費日期；分帳只算你自己的份額。帳戶之間的轉帳、還卡費、代墊與領現不計入收支。'
            : '信用卡消費改算在帳單扣款日，現金與銀行支出照日期；分帳只算你自己的份額。'}
        </p>
      </section>

      {unit === 'year' && (
        <section className="card">
          <div className="card-head"><h2>逐月趨勢</h2><span className="muted small">{year} 年 1–12 月</span></div>
          <TrendChart series={R.series} keys={keys} />
        </section>
      )}

      {unit === 'year' && (
        <section className="card list-card">
          <div className="card-head pad"><h2>逐月明細</h2><span className="muted small">點月份看細節</span></div>
          <div className="month-table">
            <div className="mt-row head small muted"><span>月份（NT$）</span>{showInc && <span>收入</span>}{showExp && <span>支出</span>}{kind === 'all' && <span>結餘</span>}{kind === 'all' && <span>投資入金</span>}</div>
            {R.series.filter((r) => r.income || r.expense || r.invest).map((r) => (
              <button
                key={r.key}
                className="mt-row"
                onClick={() => { setUnit('month'); setAnchor(`${r.key}-01`) }}
              >
                <span>{r.label}</span>
                {showInc && <Money prefix={false} v={r.income} className="pos" />}
                {showExp && <Money prefix={false} v={r.expense} />}
                {kind === 'all' && <Money prefix={false} v={r.income - r.expense} sign className={r.income - r.expense >= 0 ? 'pos' : 'neg'} />}
                {kind === 'all' && <Money prefix={false} v={r.invest} />}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="card">
        <div className="card-head">
          <h2>分類排行</h2>
          <span className="muted small">點選區塊看細節</span>
        </div>
        <Segmented<ExpDim>
          value={dim}
          onChange={setDim}
          options={[
            { value: 'cat', label: '類別' },
            { value: 'project', label: '專案' },
            { value: 'account', label: '帳戶' },
          ]}
        />
        {kind === 'all' && (
          <TypeSplit
            income={incData}
            expense={expData}
            R={R}
            byGroup={byGroup}
            dim={dim}
            single={single}
            withSaving
            onChooseGroup={setByGroup}
          />
        )}
        {kind !== 'all' && showExp && (
          <div className="rank-block">
            <div className="rank-title">
              <b>支出{dim === 'cat' ? '' : `・${DIM_LABEL[dim]}`}</b>
              {dim === 'cat' && (
                <Segmented<'cat' | 'group'>
                  value={byGroup}
                  onChange={setByGroup}
                  options={[
                    { value: 'cat', label: '10 類' },
                    { value: 'group', label: '三大類' },
                  ]}
                />
              )}
            </div>
            {dim === 'cat' && byGroup === 'group'
              ? <GroupView R={R} withSaving={false} center={single ? '本月支出' : '區間支出'} />
              : <Donut data={expData.cats} total={expData.total} center={single ? '本月支出' : '區間支出'} empty="這段期間沒有支出" />}
          </div>
        )}
        {kind !== 'all' && showInc && (
          <div className="rank-block">
            <div className="rank-title"><b>收入{dim === 'cat' ? '' : `・${DIM_LABEL[dim]}`}</b></div>
            {kind === 'income'
              ? <Donut data={incData.cats} total={incData.total} center="收入" empty="這段期間沒有收入" />
              : <RankBars data={incData.cats} color="#34C759" empty="這段期間沒有收入" />}
          </div>
        )}
      </section>

      {single && showExp && <BudgetFull month={month} />}

      <div className="grid-2">
        <section className="card">
          <div className="card-head"><h2>淨資產趨勢</h2><span className="muted small">近 6 個月月底</span></div>
          <NetWorthChart data={hist} />
        </section>
        <section className="card">
          <div className="card-head">
            <h2>月收支</h2>
            <span className="legend-inline small"><i className="dot" style={{ background: '#34C759' }} />收入 <i className="dot" style={{ background: '#FF9F0A' }} />支出</span>
          </div>
          <IOChart data={hist} />
        </section>
      </div>

      <ProjectsCard onOpen={onOpenProject} />

    </div>
  )
}

type RS = ReturnType<typeof rangeStats>
/** 三大類圓環＋可展開到各分類的列 */
function GroupView({ R, withSaving, center }: { R: RS; withSaving: boolean; center: string }) {
  const [open, setOpen] = useState<GroupKey | null>(null)
  const data: { key: GroupKey; value: number }[] = [
    { key: 'fixed' as const, value: R.fixed },
    { key: 'variable' as const, value: R.variable },
    ...(withSaving ? [{ key: 'saving' as const, value: Math.max(0, R.saving.net) }] : []),
  ].filter((d) => d.value > 0).sort((a, b) => b.value - a.value)
  const total = data.reduce((x, d) => x + d.value, 0)
  const meta = (k: string) => GROUP_META[k as GroupKey] ?? catMeta(k)
  return (
    <>
      <Donut data={data} total={total} center={center} meta={meta} label={(k) => GROUP_META[k as GroupKey]?.label ?? k} empty="這段期間沒有支出" />
      <div className="grp-drill">
        {(['fixed', 'variable', ...(withSaving ? ['saving'] : [])] as GroupKey[]).map((k) => {
          const v = k === 'saving' ? R.saving.net : R[k]
          const rows = k === 'saving' ? R.saving.byAcc : R.groupCats[k]
          return (
            <div key={k} className="grp-drill-item">
              <button className={`total-row ${open === k ? 'on' : ''}`} onClick={() => setOpen(open === k ? null : k)} aria-expanded={open === k}>
                <span className="total-row-top">
                  <span><b>{GROUP_META[k].emoji} {GROUP_META[k].label}</b> - <Money v={v} /></span>
                  <span className="num muted">{total && k !== 'saving' ? `${Math.round((v / total) * 100)}%` : k === 'saving' && total ? `${Math.round((Math.max(0, v) / total) * 100)}%` : ''}</span>
                  <span className="muted">{open === k ? '▾' : '▸'}</span>
                </span>
                <span className="bar-track"><span className="bar-fill" style={{ width: `${total ? (Math.max(0, v) / total) * 100 : 0}%`, background: GROUP_META[k].color, display: 'block' }} /></span>
              </button>
              {open === k && (
                <div className="grp-sub">
                  <RankBars data={rows} color={k === 'saving' ? GROUP_META.saving.color : undefined} empty={k === 'saving' ? '這段期間沒有轉入證券戶或儲蓄帳戶' : '這段期間沒有這類支出'} />
                  {k === 'saving' && R.saving.withdraw > 0 && <p className="muted tiny">已扣回從儲蓄／證券戶轉出的 <Money v={R.saving.withdraw} /></p>}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <p className="muted tiny">固定／變動依「設定 → 分類與子分類」的歸類；儲蓄＝轉入證券戶（入金）或儲蓄帳戶，不算支出，買進股票不重複計算。</p>
    </>
  )
}

function ProjectsCard({ onOpen }: { onOpen: (p: string) => void }) {
  const { state } = useStore()
  const list = projectList(state)
  return (
    <section className="card list-card">
      <div className="card-head pad">
        <h2>專案花費</h2>
        <span className="muted small">記帳時填「專案標籤」即可彙整</span>
      </div>
      {list.length === 0 && <p className="empty">還沒有專案。記帳時在「專案標籤」輸入例如「2026 花蓮」，這裡就會出現整趟總花費。</p>}
      {list.map((p) => {
        const top = Object.entries(p.byCat).sort((a, b) => b[1] - a[1]).slice(0, 3)
        return (
          <button key={p.project} className="row" onClick={() => onOpen(p.project)}>
            <span className="tx-icon" style={{ background: '#0A84FF14' }}>🏷️</span>
            <span className="row-main">
              <span className="row-title">{p.project}</span>
              <span className="row-sub">
                {p.first.slice(5).replace('-', '/')}–{p.last.slice(5).replace('-', '/')} · {p.count} 筆 · {top.map(([k]) => catMeta(k).emoji + k).join('、')}
              </span>
            </span>
            <span className="hold-r">
              <Money v={p.expense} className="row-amt" />
              {p.income > 0 && <span className="muted tiny">收回 <Money v={p.income} /></span>}
            </span>
            <IconChevron className="chev" />
          </button>
        )
      })}
    </section>
  )
}


const TYPE_META: Record<string, { emoji: string; label: string; color: string }> = {
  income: { emoji: '💰', label: '收入', color: '#34C759' },
  expense: { emoji: '🧾', label: '支出', color: '#FF9F0A' },
}

/** 全部模式：收入與支出一個圓環（色塊），點哪一塊再展開該類的明細排行 */
function TypeSplit({ income, expense, R, byGroup, dim, single, onChooseGroup }: {
  income: { cats: { key: string; value: number }[]; total: number }
  expense: { cats: { key: string; value: number }[]; total: number }
  R: RS; byGroup: 'cat' | 'group'; dim: ExpDim; single: boolean; withSaving: boolean
  onChooseGroup: (v: 'cat' | 'group') => void
}) {
  const [open, setOpen] = useState<'income' | 'expense' | null>(null)
  /** 專案／帳戶維度直接展開明細，不用再點 */
  const isOpen = (k: 'income' | 'expense') => dim !== 'cat' || open === k
  const data = [
    { key: 'expense', value: expense.total },
    { key: 'income', value: income.total },
  ].filter((d) => d.value > 0)
  const total = expense.total + income.total
  const label = (k: string) => TYPE_META[k]?.label ?? k
  return (
    <>
      <Donut
        data={data}
        total={total}
        center={single ? '本月收支' : '區間收支'}
        meta={(k: string) => TYPE_META[k] ?? { emoji: '•', label: k, color: '#8E8E93' }}
        label={label}
        empty="這段期間沒有收支"
      />
      <div className="grp-drill">
        {(['expense', 'income'] as const).map((k) => {
          const d = k === 'expense' ? expense : income
          const v = d.total
          return (
            <div key={k} className="grp-drill-item">
              <button className={`total-row ${isOpen(k) ? 'on' : ''}`} onClick={() => dim === 'cat' && setOpen(open === k ? null : k)} aria-expanded={isOpen(k)}>
                <span className="total-row-top">
                  <span><b>{TYPE_META[k].emoji} {TYPE_META[k].label}</b> - <Money v={v} /></span>
                  <span className="num muted">{total ? `${Math.round((v / total) * 100)}%` : ''}</span>
                  {dim === 'cat' && <span className="muted">{open === k ? '▾' : '▸'}</span>}
                </span>
                <span className="bar-track"><span className="bar-fill" style={{ width: `${total ? (v / total) * 100 : 0}%`, background: TYPE_META[k].color, display: 'block' }} /></span>
              </button>
              {isOpen(k) && (
                <div className="grp-sub">
                  {k === 'expense' && dim === 'cat' && (
                    <Segmented<'cat' | 'group'>
                      value={byGroup}
                      onChange={onChooseGroup}
                      options={[
                        { value: 'cat', label: '10 類' },
                        { value: 'group', label: '三大類' },
                      ]}
                    />
                  )}
                  {k === 'expense' && dim === 'cat' && byGroup === 'group'
                    ? <GroupView R={R} withSaving={false} center={single ? '本月支出' : '區間支出'} />
                    : <RankBars data={d.cats} color={TYPE_META[k].color} empty={k === 'expense' ? '這段期間沒有支出' : '這段期間沒有收入'} />}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}
