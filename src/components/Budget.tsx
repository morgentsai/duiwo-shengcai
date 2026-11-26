import { useMemo, useState } from 'react'
import type { BudgetCfg, Grp } from '../types'
import { DEFAULT_SAVING_TARGET, GROUP_META, catMeta } from '../types'
import { useStore } from '../store'
import { budgetLimits, budgetStatus, groupAverages, groupLimitHints, groupStatus, incomeEstimate, money, monthLabel, quickKey, shiftMonth, thisMonth } from '../logic'
import type { BudgetLevel } from '../logic'
import { Segmented } from './ui'

type Row = { key: string; spent: number; limit: number; remain: number; ratio: number; level: BudgetLevel }

function Bar({ r }: { r: Row }) {
  return (
    <div className="bbar">
      <div className={`bbar-fill ${r.level}`} style={{ width: `${Math.min(100, r.ratio * 100)}%` }} />
    </div>
  )
}

function Remain({ r }: { r: Row }) {
  const { hidden } = useStore()
  if (!r.limit) return <span className="muted small">未設上限</span>
  return r.remain < 0
    ? <span className="b-remain over">超支 {money(-r.remain, hidden)}</span>
    : <span className={`b-remain ${r.level}`}>餘額 {money(r.remain, hidden)}</span>
}

function BudgetRow({ r, label, sub }: { r: Row; label: string; sub?: boolean }) {
  const { hidden } = useStore()
  return (
    <div className={`brow ${sub ? 'sub' : ''}`}>
      <div className="brow-top">
        <span className="brow-name">{label}</span>
        <Remain r={r} />
      </div>
      {r.limit > 0 && <Bar r={r} />}
      <div className="brow-meta muted small">
        <span>已花 {money(r.spent, hidden)}{r.limit ? ` / 上限 ${money(r.limit, hidden)}` : ''}</span>
        {r.limit > 0 && <span className={`b-pct ${r.level}`}>{Math.floor(r.ratio * 100)}%</span>}
      </div>
    </div>
  )
}

function TotalBox({ st }: { st: ReturnType<typeof budgetStatus> }) {
  const { hidden } = useStore()
  const t = st.total
  if (!t.limit) return <p className="muted small">還沒設定上限。<a href="#settings/budget" className="link">到「設定 → 每月花費上限」設定</a>後，這裡會顯示餘額與每日可花。</p>
  return (
    <div className="btotal">
      <div className="btotal-nums">
        <div>
          <span className="muted small">{t.explicit ? '本月總上限餘額' : '各類上限合計餘額'}</span>
          <span className={`num big ${t.remain < 0 ? 'neg' : ''}`}>{t.remain < 0 ? `超支 ${money(-t.remain, hidden)}` : money(t.remain, hidden)}</span>
        </div>
        {st.perDay !== null && (
          <div className="right">
            <span className="muted small">本月剩餘每日可花</span>
            <span className={`num big ${t.level}`}>{money(st.perDay, hidden)}</span>
            <span className="muted tiny">剩 {st.daysLeft} 天</span>
          </div>
        )}
      </div>
      <Bar r={t} />
      <div className="brow-meta muted small">
        <span>已花 {money(t.spent, hidden)} / {money(t.limit, hidden)}</span>
        <span className={`b-pct ${t.level}`}>{Math.floor(t.ratio * 100)}%</span>
      </div>
    </div>
  )
}

type GStatus = ReturnType<typeof groupStatus>

/** 儲蓄進度：越多越好，一律用綠色系（達標更深） */
function SavingRow({ sv }: { sv: GStatus['saving'] }) {
  const { hidden } = useStore()
  const m = GROUP_META.saving
  const done = sv.saved >= sv.target
  return (
    <div className="brow grp-row">
      <div className="brow-top">
        <span className="brow-name">{m.emoji} {m.label}</span>
        <span className={`b-remain save ${done ? 'done' : ''}`}>{done ? `已達標 +${money(sv.saved - sv.target, hidden)}` : `還差 ${money(sv.remain, hidden)}`}</span>
      </div>
      <div className="bbar"><div className={`bbar-fill save ${done ? 'done' : ''}`} style={{ width: `${Math.min(100, sv.ratio * 100)}%` }} /></div>
      <div className="brow-meta muted small">
        <span>已存 {money(sv.saved, hidden)} / 目標 {money(sv.target, hidden)}</span>
        <span className="b-pct save">{Math.floor(sv.ratio * 100)}%</span>
      </div>
    </div>
  )
}

function GroupRows({ st }: { st: GStatus }) {
  return (
    <div className="brows">
      {(['fixed', 'variable'] as Grp[]).map((k) => <BudgetRow key={k} r={st[k]} label={`${GROUP_META[k].emoji} ${GROUP_META[k].label}`} />)}
      <SavingRow sv={st.saving} />
    </div>
  )
}

/** 總覽：三大類預算 */
export function GroupCard() {
  const { state } = useStore()
  const st = useMemo(() => groupStatus(state, thisMonth()), [state])
  const noBudget = !st.fixed.limit && !st.variable.limit
  return (
    <section className="card budget-mini" id="group-card">
      <div className="card-head">
        <h2>三大類預算</h2>
        <a className="link" href="#settings/budget">設定 ›</a>
      </div>
      <GroupRows st={st} />
      {noBudget && <p className="muted tiny">固定／變動支出還沒設預算，<a href="#settings/budget" className="link">到「設定 → 每月花費上限」</a>依收入分配。</p>}
    </section>
  )
}

/** 設定：三大類預算＋收入分配預覽 */
function GroupBudgetSettings() {
  const { state, setBudgetCfg, hidden } = useStore()
  const cfg: BudgetCfg = state.budgetCfg ?? {}
  const g = cfg.groups ?? {}
  const num = (v: string) => Math.max(0, Math.round(Number(v.replace(/[^\d]/g, '')) || 0))
  const hints = groupLimitHints(state, thisMonth())
  const avg = useMemo(() => groupAverages(state), [state])
  const inc = incomeEstimate(state)
  const setG = (k: 'fixed' | 'variable' | 'saving', v: string) => {
    const n = { ...g }
    if (v.trim() === '') delete n[k]
    else n[k] = num(v)
    setBudgetCfg({ ...cfg, groups: n })
  }
  const val = { fixed: g.fixed ?? 0, variable: g.variable ?? 0, saving: g.saving ?? DEFAULT_SAVING_TARGET }
  const alloc = val.fixed + val.variable + val.saving
  const left = inc.value - alloc
  const pctOf = (n: number) => (inc.value ? `${Math.round((n / inc.value) * 100)}%` : '—')
  const rows: { k: 'fixed' | 'variable' | 'saving'; hint: string }[] = [
    { k: 'fixed', hint: `分類上限合計 ${money(hints.fixed, hidden)} · 近 3 月平均 ${money(avg.fixed, hidden)}` },
    { k: 'variable', hint: `分類上限合計 ${money(hints.variable, hidden)} · 近 3 月平均 ${money(avg.variable, hidden)}` },
    { k: 'saving', hint: `近 3 月平均已存 ${money(avg.saving, hidden)} · 證券入金＋儲蓄帳戶` },
  ]
  return (
    <div className="grp-set">
      <h3 className="pref-h">三大類預算（每月）</h3>
      <p className="muted tiny">和下面的分類上限各自獨立。固定／變動支出：綠＜80%、黃 80–100%、紅＝超支；儲蓄越多越好。</p>
      {rows.map(({ k, hint }) => (
        <div key={k} className="grp-in">
          <label className="limit-row">
            <span className="limit-name">{GROUP_META[k].emoji} {k === 'saving' ? '儲蓄目標' : GROUP_META[k].label}</span>
            <input
              inputMode="numeric"
              value={k === 'saving' ? (g.saving === undefined ? '' : String(g.saving)) : g[k] ? String(g[k]) : ''}
              placeholder={k === 'saving' ? `${DEFAULT_SAVING_TARGET.toLocaleString()}（預設）` : '未設'}
              onChange={(e) => setG(k, e.target.value)}
              aria-label={`${GROUP_META[k].label} 每月預算`}
            />
          </label>
          <span className="muted tiny grp-hint">{hint}</span>
        </div>
      ))}

      <div className="alloc">
        <div className="alloc-head">
          <span className="strong">收入分配</span>
          <label className="alloc-inc">
            <span className="muted tiny">每月收入（{inc.manual ? '手動' : inc.basis}）</span>
            <input inputMode="numeric" value={cfg.incomeEst ? String(cfg.incomeEst) : ''} placeholder={inc.auto ? inc.auto.toLocaleString() : '輸入'} onChange={(e) => setBudgetCfg({ ...cfg, incomeEst: num(e.target.value) || undefined })} aria-label="每月收入估計" />
          </label>
        </div>
        <div className="alloc-bar" aria-hidden="true">
          {(['fixed', 'variable', 'saving'] as const).map((k) => inc.value > 0 && val[k] > 0 && (
            <i key={k} style={{ width: `${Math.min(100, (val[k] / Math.max(inc.value, alloc)) * 100)}%`, background: GROUP_META[k].color }} />
          ))}
        </div>
        {(['fixed', 'variable', 'saving'] as const).map((k) => (
          <div key={k} className="alloc-row small">
            <span><i className="dot" style={{ background: GROUP_META[k].color }} />{GROUP_META[k].label}</span>
            <span className="num">{money(val[k], hidden)}</span>
            <span className="num muted">{pctOf(val[k])}</span>
          </div>
        ))}
        <div className={`alloc-row small strong ${left < 0 ? 'neg' : ''}`}>
          <span>{left < 0 ? '超出收入' : '尚未分配'}</span>
          <span className="num">{money(Math.abs(left), hidden)}</span>
          <span className="num muted">{pctOf(Math.abs(left))}</span>
        </div>
      </div>
    </div>
  )
}

/** 總覽：精簡版 */
export function BudgetMini({ onMore }: { onMore: () => void }) {
  const { state } = useStore()
  const st = useMemo(() => budgetStatus(state, thisMonth()), [state])
  const top = st.cats.filter((r) => r.limit > 0).sort((a, b) => b.ratio - a.ratio).slice(0, 4)
  return (
    <section className="card budget-mini">
      <div className="card-head">
        <h2>本月花費上限</h2>
        <button className="link" onClick={onMore}>全部分類 ›</button>
      </div>
      <TotalBox st={st} />
      {top.map((r) => <BudgetRow key={r.key} r={r} label={`${catMeta(r.key).emoji} ${r.key}`} />)}
    </section>
  )
}

/** 分析頁：完整版 */
export function BudgetFull({ month }: { month: string }) {
  const { state } = useStore()
  const st = useMemo(() => budgetStatus(state, month), [state, month])
  const withLimit = st.cats.filter((r) => r.limit > 0).sort((a, b) => b.ratio - a.ratio)
  const noLimit = st.cats.filter((r) => !r.limit && r.spent > 0)
  return (
    <section className="card budget-full" id="budget-full">
      <div className="card-head">
        <h2>各類別花費上限</h2>
        <a className="link small" href="#settings/budget">{monthLabel(month)}{st.overridden ? '・單月調整' : ''} · 設定 ›</a>
      </div>
      <TotalBox st={st} />
      <div className="brows">
        {withLimit.map((r) => (
          <div key={r.key}>
            <BudgetRow r={r} label={`${catMeta(r.key).emoji} ${r.key}`} />
            {st.subs.filter((x) => x.key.startsWith(`${r.key}|`)).map((x) => <BudgetRow key={x.key} r={x} label={`└ ${x.key.split('|')[1]}`} sub />)}
          </div>
        ))}
        {noLimit.map((r) => <BudgetRow key={r.key} r={r} label={`${catMeta(r.key).emoji} ${r.key}`} />)}
      </div>
      <p className="muted tiny">綠色＜80%、黃色 80–100%、紅色＝超支。轉帳、繳卡費、投資都不算花費。</p>
    </section>
  )
}

/** 設定：每月花費上限 */
export function BudgetSettings({ standalone }: { standalone?: boolean } = {}) {
  const { state, setBudget, setBudgetCfg, expCats, flash, hidden } = useStore()
  const cur = thisMonth()
  const [openState, setOpen] = useState(false)
  const open = standalone || openState
  const [scope, setScope] = useState<'all' | 'month'>('all')
  const [month, setMonth] = useState(cur)
  const [subKey, setSubKey] = useState('')
  const [subAmt, setSubAmt] = useState('')
  const cfg: BudgetCfg = state.budgetCfg ?? {}
  const ov = cfg.overrides?.[month] ?? {}
  const eff = budgetLimits(state, month)
  const num = (v: string) => Math.max(0, Math.round(Number(v.replace(/[^\d]/g, '')) || 0))

  const setOv = (patch: { cats?: Record<string, number>; total?: number | null }) => {
    const cur0 = cfg.overrides?.[month] ?? {}
    const next: { cats?: Record<string, number>; total?: number } = { ...cur0, ...(patch.cats ? { cats: patch.cats } : {}) }
    if (patch.total === null) delete next.total
    else if (patch.total !== undefined) next.total = patch.total
    const overrides = { ...(cfg.overrides ?? {}), [month]: next }
    if (!Object.keys(next.cats ?? {}).length && next.total === undefined) delete overrides[month]
    setBudgetCfg({ ...cfg, overrides })
  }
  const catVal = (k: string) => (scope === 'all' ? state.budgets[k] || '' : ov.cats?.[k] ?? '')
  const onCat = (k: string, v: string) => {
    if (scope === 'all') return setBudget(k, num(v))
    const cats = { ...(ov.cats ?? {}) }
    if (v.trim() === '') delete cats[k]
    else cats[k] = num(v)
    setOv({ cats })
  }
  const totalVal = scope === 'all' ? cfg.total || '' : ov.total ?? ''
  const onTotal = (v: string) => (scope === 'all' ? setBudgetCfg({ ...cfg, total: num(v) }) : setOv({ total: v.trim() === '' ? null : num(v) }))
  const subs = Object.entries(cfg.subs ?? {})
  const months = Array.from({ length: 6 }, (_, i) => shiftMonth(cur, i - 2))

  return (
    <section className="card prefs-card" id="budget-settings">
      {!standalone && (
        <button className="card-head as-btn" onClick={() => setOpen(!open)} aria-expanded={open}>
        <h2>每月花費上限</h2>
        <span className="muted small">{open ? '收合' : '各分類上限、總上限、單月調整 ›'}</span>
      </button>
      )}
      {open && (
        <div className="prefs">
          <Segmented<'all' | 'month'>
            value={scope}
            onChange={setScope}
            options={[
              { value: 'all', label: '每個月都套用' },
              { value: 'month', label: '只調整某個月' },
            ]}
          />
          {scope === 'all' && <GroupBudgetSettings />}
          {scope === 'all' && <h3 className="pref-h">各分類上限</h3>}
          {scope === 'month' && (
            <div className="month-pick">
              <select value={month} onChange={(e) => setMonth(e.target.value)} aria-label="要調整的月份">
                {months.map((m) => <option key={m} value={m}>{monthLabel(m)}{cfg.overrides?.[m] ? '（已調整）' : ''}</option>)}
              </select>
              {cfg.overrides?.[month] && (
                <button className="btn small ghost" onClick={() => { const o = { ...(cfg.overrides ?? {}) }; delete o[month]; setBudgetCfg({ ...cfg, overrides: o }); flash(`${monthLabel(month)} 已改回每月預設`) }}>改回每月預設</button>
              )}
            </div>
          )}
          <p className="muted tiny">{scope === 'all' ? '空白＝不設上限。這組上限每個月自動套用。' : `空白＝沿用每月預設（灰字）。只影響 ${monthLabel(month)}。`}</p>

          <label className="limit-row total">
            <span className="limit-name">💰 每月總上限（選填）</span>
            <input inputMode="numeric" value={totalVal === '' ? '' : String(totalVal)} placeholder={scope === 'month' && cfg.total ? `沿用 ${cfg.total.toLocaleString()}` : '不限'} onChange={(e) => onTotal(e.target.value)} aria-label="每月總上限" />
          </label>
          <div className="limit-list">
            {expCats.map((c) => (
              <label key={c.key} className="limit-row">
                <span className="limit-name">{c.emoji} {c.key}</span>
                <input
                  inputMode="numeric"
                  value={catVal(c.key) === '' ? '' : String(catVal(c.key))}
                  placeholder={scope === 'month' && state.budgets[c.key] ? `沿用 ${state.budgets[c.key].toLocaleString()}` : '不限'}
                  onChange={(e) => onCat(c.key, e.target.value)}
                  aria-label={`${c.key} 每月上限`}
                />
              </label>
            ))}
          </div>
          <p className="muted small">本月實際生效合計：{money(Object.values(eff.cats).reduce((x, y) => x + y, 0), hidden)}{eff.total ? `；總上限 ${money(eff.total, hidden)}` : ''}</p>

          <h3 className="pref-h">子分類上限（選填，每月套用）</h3>
          {subs.map(([k, v]) => (
            <label key={k} className="limit-row">
              <span className="limit-name">{catMeta(k.split('|')[0]).emoji} {k.split('|')[0]}・{k.split('|')[1]}</span>
              <input inputMode="numeric" value={String(v)} onChange={(e) => setBudgetCfg({ ...cfg, subs: { ...(cfg.subs ?? {}), [k]: num(e.target.value) } })} aria-label={`${k} 上限`} />
              <button className="icon-btn sm" aria-label="移除" onClick={() => { const n = { ...(cfg.subs ?? {}) }; delete n[k]; setBudgetCfg({ ...cfg, subs: n }) }}>✕</button>
            </label>
          ))}
          <div className="qp-add">
            <select value={subKey} onChange={(e) => setSubKey(e.target.value)} aria-label="選擇子分類">
              <option value="">＋ 選擇子分類…</option>
              {expCats.filter((c) => c.subs.length).map((c) => (
                <optgroup key={c.key} label={`${c.emoji} ${c.key}`}>
                  {c.subs.map((s) => <option key={s} value={quickKey(c.key, s)} disabled={!!cfg.subs?.[quickKey(c.key, s)]}>{s}</option>)}
                </optgroup>
              ))}
            </select>
            <input className="sub-amt" inputMode="numeric" placeholder="上限" value={subAmt} onChange={(e) => setSubAmt(e.target.value)} aria-label="子分類上限金額" />
            <button className="btn small primary" disabled={!subKey || !num(subAmt)} onClick={() => { setBudgetCfg({ ...cfg, subs: { ...(cfg.subs ?? {}), [subKey]: num(subAmt) } }); setSubKey(''); setSubAmt('') }}>加入</button>
          </div>
        </div>
      )}
    </section>
  )
}
