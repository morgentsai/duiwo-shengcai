import { useMemo, useState } from 'react'
import type { StatMode, TxKind } from '../logic'
import type { GroupKey } from '../types'
import { GROUP_META, catMeta } from '../types'
import { useStore } from '../store'
import { BudgetFull } from '../components/Budget'
import { monthFlows, monthLabel, rangeStats, netWorthHistory, projectList, shiftMonth, thisMonth, todayStr } from '../logic'
import { Money, Segmented } from '../components/ui'
import { Donut, IOChart, TotalOverview, NetWorthChart, RankBars, Sankey, TrendChart } from '../components/charts'
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
  const flows = useMemo(() => monthFlows(state, start, end), [state, start, end])
  const hist = netWorthHistory(state, 6)
  const rangeLabel = unit === 'year' ? `${year} 年` : single ? monthLabel(month) : unit === 'week' ? `週 ${start.slice(5).replace('-', '/')}（一）– ${end.slice(5).replace('-', '/')}（日）` : `${start.replace(/-/g, '/')} – ${end.replace(/-/g, '/')}`
  const showExp = kind === 'all' || kind === 'expense'
  const showInc = kind === 'all' || kind === 'income'
  const showTr = kind === 'all' || kind === 'transfer'
  const keys = (kind === 'all' ? ['income', 'expense', 'transfer'] : [kind]) as ('income' | 'expense' | 'transfer')[]

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
            { value: 'transfer', label: '轉帳' },
          ]}
        />
        {kind !== 'income' && kind !== 'transfer' && (
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
          <TotalOverview income={R.income} expense={R.expense} transfer={R.transfer} onPick={setKind} />
        </section>
      )}

      <section className="card">
        <div className="card-head"><h2>{rangeLabel}</h2><span className="muted small">{R.days} 天 · {R.nExp + R.nInc + R.nTr} 筆</span></div>
        <div className="mode-sum">
          {showInc && <div><span className="muted small">收入 · {R.nInc} 筆</span><Money v={R.income} className="strong pos" /></div>}
          {showExp && <div><span className="muted small">{mode === 'spend' ? '支出' : '實際流出'} · {R.nExp} 筆</span><Money v={R.expense} className="strong" /></div>}
          {kind === 'all' && <div><span className="muted small">結餘</span><Money v={R.net} sign className={`strong ${R.net >= 0 ? 'pos' : 'neg'}`} /></div>}
          {showTr && <div><span className="muted small">轉帳（另計）· {R.nTr} 筆</span><Money v={R.transfer} className={kind === 'transfer' ? 'strong' : ''} /></div>}
          {showExp && <div><span className="muted small">其中信用卡</span><Money v={R.card} /></div>}
          {kind === 'all' && <div><span className="muted small">{GROUP_META.saving.emoji} 儲蓄（另計）</span><Money v={R.saving.net} className="strong pos" /></div>}
          {showExp && R.shared > 0 && <div><span className="muted small">幫朋友代墊（不算支出）</span><Money v={R.shared} /></div>}
        </div>
        <p className="hint">
          {kind === 'transfer'
            ? '轉帳只是錢在自己帳戶間移動（含繳卡費、投入證券、收回代墊），不算收入也不算支出。'
            : mode === 'spend'
              ? '支出依刷卡／消費日期；分帳只算你自己的份額。轉帳另列，不計入收支。'
              : '信用卡消費改算在帳單扣款日，現金與銀行支出照日期；分帳只算你自己的份額。'}
        </p>
      </section>

      <section className="card">
        <div className="card-head"><h2>趨勢</h2><span className="muted small">{R.byDay ? '按日' : '按月'}</span></div>
        <TrendChart series={R.series} keys={keys} />
      </section>

      {unit === 'year' && (
        <section className="card list-card">
          <div className="card-head pad"><h2>逐月明細</h2><span className="muted small">點月份看細節</span></div>
          <div className="month-table">
            <div className="mt-row head small muted"><span>月份（NT$）</span>{showInc && <span>收入</span>}{showExp && <span>支出</span>}{kind === 'all' && <span>結餘</span>}{showTr && <span>轉帳</span>}</div>
            {R.series.filter((r) => r.income || r.expense || r.transfer).map((r) => (
              <button
                key={r.key}
                className="mt-row"
                onClick={() => { setUnit('month'); setAnchor(`${r.key}-01`) }}
              >
                <span>{r.label}</span>
                {showInc && <Money prefix={false} v={r.income} className="pos" />}
                {showExp && <Money prefix={false} v={r.expense} />}
                {kind === 'all' && <Money prefix={false} v={r.income - r.expense} sign className={r.income >= r.expense ? 'pos' : 'neg'} />}
                {showTr && <Money prefix={false} v={r.transfer} className="muted" />}
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="grid-2">
        {showExp && (
          <section className="card">
            <div className="card-head"><h2>{byGroup === 'group' ? '三大類' : '支出分類排行'}</h2><span className="muted small">點選區塊看細節</span></div>
            <Segmented<'cat' | 'group'>
              value={byGroup}
              onChange={setByGroup}
              options={[
                { value: 'cat', label: '10 類' },
                { value: 'group', label: '三大類' },
              ]}
            />
            {byGroup === 'cat'
              ? <Donut data={R.expCats} total={R.expense} center={single ? '本月支出' : '區間支出'} empty="這段期間沒有支出" />
              : <GroupView R={R} withSaving={kind === 'all'} center={kind === 'all' ? '支出＋儲蓄' : single ? '本月支出' : '區間支出'} />}
          </section>
        )}
        {showInc && (
          <section className="card">
            <div className="card-head"><h2>收入來源排行</h2></div>
            {kind === 'income'
              ? <Donut data={R.incCats} total={R.income} center="收入" empty="這段期間沒有收入" />
              : <RankBars data={R.incCats} color="#34C759" empty="這段期間沒有收入" />}
          </section>
        )}
        {showTr && (
          <section className="card">
            <div className="card-head"><h2>轉帳類型</h2><span className="muted small">不計入收支</span></div>
            <RankBars data={R.trCats} color="#8E8E93" empty="這段期間沒有轉帳" />
          </section>
        )}
        {showTr && (
          <section className="card">
            <div className="card-head"><h2>轉出 → 轉入</h2><span className="muted small">依帳戶彙整</span></div>
            <RankBars data={R.pairs.slice(0, 12).map((p) => ({ key: `${p.from} → ${p.to}`, value: p.amount, sub: `${p.count} 筆` }))} color="#5E5CE6" empty="這段期間沒有轉帳" />
          </section>
        )}
      </div>

      <section className="card">
        <div className="card-head"><h2>{single ? '本月資金流向' : '區間資金流向'}</h2><span className="muted small">點節點聚焦 · 可左右滑動</span></div>
        <Sankey nodes={flows.nodes} links={flows.links} />
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

