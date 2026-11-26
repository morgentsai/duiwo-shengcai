import { useState } from 'react'
import { catMeta } from '../types'
import { useStore } from '../store'
import { money, monthLabel } from '../logic'

type Meta = (k: string) => { emoji: string; color: string }
export function Donut({ data, total, center = '本月支出', empty = '這個月還沒有支出', meta = catMeta, label }: { data: { key: string; value: number }[]; total: number; center?: string; empty?: string; meta?: Meta; label?: (k: string) => string }) {
  const { hidden } = useStore()
  const [active, setActive] = useState<string | null>(null)
  const R = 70
  const C = 2 * Math.PI * R
  let acc = 0
  const act = data.find((d) => d.key === active)
  return (
    <div className="donut-wrap">
      <svg viewBox="0 0 200 200" className="donut" role="img" aria-label="消費分類圓餅圖">
        <circle cx="100" cy="100" r={R} fill="none" stroke="#F2F2F7" strokeWidth="26" />
        {total > 0 &&
          data.map((d) => {
            const len = (d.value / total) * C
            const gap = data.length > 1 ? Math.min(2, len / 3) : 0
            const el = (
              <circle
                key={d.key}
                cx="100"
                cy="100"
                r={R}
                fill="none"
                stroke={meta(d.key).color}
                strokeWidth={active === d.key ? 32 : 26}
                strokeDasharray={`${Math.max(0, len - gap)} ${C}`}
                strokeDashoffset={-acc}
                transform="rotate(-90 100 100)"
                style={{ cursor: 'pointer', transition: 'stroke-width .2s, opacity .2s', opacity: active && active !== d.key ? 0.35 : 1 }}
                onClick={() => setActive(active === d.key ? null : d.key)}
                onMouseEnter={() => setActive(d.key)}
                onMouseLeave={() => setActive(null)}
              />
            )
            acc += len
            return el
          })}
        <text x="100" y="92" textAnchor="middle" className="donut-k">{act ? `${meta(act.key).emoji} ${label ? label(act.key) : act.key}` : center}</text>
        <text x="100" y="116" textAnchor="middle" className="donut-v">{money(act ? act.value : total, hidden)}</text>
        {act && total > 0 && <text x="100" y="136" textAnchor="middle" className="donut-k">{((act.value / total) * 100).toFixed(1)}%</text>}
      </svg>
      <div className="donut-legend">
        {data.map((d, i) => (
          <button key={d.key} className={`legend-row ${active === d.key ? 'on' : ''}`} onClick={() => setActive(active === d.key ? null : d.key)}>
            <span className="rank">{i + 1}</span>
            <span className="dot" style={{ background: meta(d.key).color }} />
            <span className="legend-name">{meta(d.key).emoji} {label ? label(d.key) : d.key}</span>
            <span className="num muted small">{total ? ((d.value / total) * 100).toFixed(0) : 0}%</span>
            <span className="num">{money(d.value, hidden)}</span>
          </button>
        ))}
        {!data.length && <p className="empty">{empty}</p>}
      </div>
    </div>
  )
}

const kfmt = (n: number) => (Math.abs(n) >= 10000 ? `${(n / 10000).toFixed(Math.abs(n) >= 100000 ? 0 : 1)}萬` : Math.round(n).toLocaleString())

export function NetWorthChart({ data }: { data: { month: string; net: number }[] }) {
  const { hidden } = useStore()
  const [hover, setHover] = useState<number | null>(null)
  const W = 340, H = 170, P = { l: 8, r: 8, t: 22, b: 26 }
  const vals = data.map((d) => d.net)
  const min = Math.min(...vals), max = Math.max(...vals)
  const pad = (max - min) * 0.25 || Math.abs(max) * 0.05 || 1
  const lo = min - pad, hi = max + pad
  const x = (i: number) => P.l + (i * (W - P.l - P.r)) / Math.max(1, data.length - 1)
  const y = (v: number) => P.t + (1 - (v - lo) / (hi - lo)) * (H - P.t - P.b)
  const line = data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d.net).toFixed(1)}`).join(' ')
  const area = `${line} L${x(data.length - 1)},${H - P.b} L${x(0)},${H - P.b} Z`
  const hi_ = hover ?? data.length - 1
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="淨資產趨勢">
      <defs>
        <linearGradient id="nwg" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#0A84FF" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#0A84FF" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#nwg)" />
      <path d={line} fill="none" stroke="#0A84FF" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
      {data.map((d, i) => (
        <g key={d.month} onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} onMouseLeave={() => setHover(null)} style={{ cursor: 'pointer' }}>
          <rect x={x(i) - 22} y={0} width={44} height={H} fill="transparent" />
          <circle cx={x(i)} cy={y(d.net)} r={i === hi_ ? 4.5 : 3} fill="#fff" stroke="#0A84FF" strokeWidth="2" />
          <text x={x(i)} y={H - 8} textAnchor="middle" className="axis">{monthLabel(d.month, true)}</text>
        </g>
      ))}
      <text x={Math.min(Math.max(x(hi_), 40), W - 40)} y={Math.max(12, y(data[hi_].net) - 10)} textAnchor="middle" className="chart-tip">
        {hidden ? '••••' : kfmt(data[hi_].net)}
      </text>
    </svg>
  )
}

export function IOChart({ data }: { data: { month: string; income: number; expense: number }[] }) {
  const { hidden } = useStore()
  const W = 340, H = 170, P = { t: 18, b: 26 }
  const max = Math.max(1, ...data.flatMap((d) => [d.income, d.expense])) * 1.1
  const bw = 13
  const slot = W / data.length
  const h = (v: number) => (v / max) * (H - P.t - P.b)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="月收支趨勢">
      {data.map((d, i) => {
        const cx = slot * i + slot / 2
        return (
          <g key={d.month}>
            <rect x={cx - bw - 1.5} y={H - P.b - h(d.income)} width={bw} height={h(d.income)} rx="3.5" fill="#34C759" />
            <rect x={cx + 1.5} y={H - P.b - h(d.expense)} width={bw} height={h(d.expense)} rx="3.5" fill="#FF9F0A" />
            {!hidden && <text x={cx} y={Math.max(11, H - P.b - h(Math.max(d.income, d.expense)) - 5)} textAnchor="middle" className="axis">{kfmt(d.income - d.expense)}</text>}
            <text x={cx} y={H - 8} textAnchor="middle" className="axis">{monthLabel(d.month, true)}</text>
          </g>
        )
      })}
    </svg>
  )
}

/** 近 12 個月：投入本金（虛線）vs 市值（實線） */
export function InvestChart({ data }: { data: { month: string; principal: number; value: number }[] }) {
  const { hidden } = useStore()
  const [hover, setHover] = useState<number | null>(null)
  if (data.length < 2) return <p className="empty">更新現價或記錄交易後，每月會自動存一筆快照，累積兩個月以上就會出現走勢圖。</p>
  const W = 340, H = 170, P = { l: 8, r: 8, t: 26, b: 24 }
  const vals = data.flatMap((d) => [d.principal, d.value])
  const min = Math.min(...vals), max = Math.max(...vals)
  const pad = (max - min) * 0.15 || 1
  const lo = min - pad, hi = max + pad
  const x = (i: number) => P.l + (i * (W - P.l - P.r)) / Math.max(1, data.length - 1)
  const y = (v: number) => P.t + (1 - (v - lo) / (hi - lo)) * (H - P.t - P.b)
  const path = (k: 'principal' | 'value') => data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d[k]).toFixed(1)}`).join(' ')
  const i = hover ?? data.length - 1
  const d = data[i]
  return (
    <div>
      <div className="inv-legend small">
        <span className="legend-inline"><i className="dot" style={{ background: '#8E8E93' }} />投入本金　<i className="dot" style={{ background: '#34C759' }} />市值</span>
        <span className="muted">
          {monthLabel(d.month, true)}：本金 {hidden ? '••••' : kfmt(d.principal)} · 市值 {hidden ? '••••' : kfmt(d.value)}（{d.principal ? `${((d.value / d.principal - 1) * 100).toFixed(1)}%` : '—'}）
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="投入本金與市值走勢">
        <path d={`${path('value')} L${x(data.length - 1)},${H - P.b} L${x(0)},${H - P.b} Z`} fill="#34C75918" />
        <path d={path('principal')} fill="none" stroke="#8E8E93" strokeWidth="1.8" strokeDasharray="4 4" />
        <path d={path('value')} fill="none" stroke="#34C759" strokeWidth="2.2" strokeLinejoin="round" />
        {data.map((p, k) => (
          <g key={p.month} onMouseEnter={() => setHover(k)} onClick={() => setHover(k)} onMouseLeave={() => setHover(null)} style={{ cursor: 'pointer' }}>
            <rect x={x(k) - 14} y={0} width={28} height={H} fill="transparent" />
            {k === i && <line x1={x(k)} x2={x(k)} y1={P.t - 6} y2={H - P.b} stroke="#C7C7CC" strokeDasharray="2 3" />}
            <circle cx={x(k)} cy={y(p.value)} r={k === i ? 4 : 2.5} fill="#fff" stroke="#34C759" strokeWidth="2" />
            {(k % 2 === data.length % 2 || k === data.length - 1) && <text x={x(k)} y={H - 7} textAnchor={k === 0 ? 'start' : k === data.length - 1 ? 'end' : 'middle'} className="axis">{monthLabel(p.month, true)}</text>}
          </g>
        ))}
      </svg>
    </div>
  )
}

export interface FlowNode { id: string; label: string; color: string }
export interface FlowLink { source: string; target: string; value: number }

/** 分層 Sankey：節點依資金流向自動分欄（遇循環自動斷開），帶寬＝金額 */
export function Sankey({ nodes, links }: { nodes: FlowNode[]; links: FlowLink[] }) {
  const { hidden } = useStore()
  const [active, setActive] = useState<string | null>(null)
  if (!links.length) return <p className="empty">這個月還沒有資金流動紀錄</p>
  const ids = nodes.map((n) => n.id)
  // ---- 分層（Kahn + 斷環） ----
  const live = links.filter((l) => l.source !== l.target && ids.includes(l.source) && ids.includes(l.target))
  const indeg = new Map(ids.map((id) => [id, 0]))
  for (const l of live) indeg.set(l.target, (indeg.get(l.target) ?? 0) + 1)
  const layer = new Map<string, number>()
  const done = new Set<string>()
  const kept: FlowLink[] = []
  while (done.size < ids.length) {
    let ready = ids.filter((id) => !done.has(id) && (indeg.get(id) ?? 0) === 0)
    if (!ready.length) {
      const rest = ids.filter((id) => !done.has(id)).sort((a, b) => (indeg.get(a) ?? 0) - (indeg.get(b) ?? 0))
      ready = [rest[0]]
    }
    for (const id of ready) {
      done.add(id)
      const ins = live.filter((l) => l.target === id && done.has(l.source) && l.source !== id)
      layer.set(id, ins.length ? Math.max(...ins.map((l) => (layer.get(l.source) ?? 0) + 1)) : 0)
      for (const l of live.filter((l) => l.source === id && !done.has(l.target))) {
        indeg.set(l.target, (indeg.get(l.target) ?? 1) - 1)
        kept.push(l)
      }
    }
  }
  // 沒有流入的帳戶（例如本月沒繳費的信用卡）往右靠到它的去向前一欄
  for (let pass = 0; pass < 3; pass++)
    for (const n of nodes) {
      if (n.id.startsWith('src:') || kept.some((l) => l.target === n.id)) continue
      const outs = kept.filter((l) => l.source === n.id).map((l) => layer.get(l.target) ?? 1)
      if (outs.length) layer.set(n.id, Math.max(0, Math.min(...outs) - 1))
    }
  const maxL = Math.max(...[...layer.values()])
  // 終點（實際消費、待收、持倉）放最右
  for (const n of nodes) if (n.id.startsWith('sink:')) layer.set(n.id, maxL)
  const used = nodes.filter((n) => kept.some((l) => l.source === n.id || l.target === n.id))
  const cols = Math.max(...used.map((n) => layer.get(n.id) ?? 0)) + 1
  const NW = 12, PADY = 26, TOP = 8
  const colCount = (c: number) => used.filter((n) => (layer.get(n.id) ?? 0) === c).length
  const W = Math.max(640, cols * 150), H = Math.max(360, Math.max(...Array.from({ length: cols }, (_, c) => colCount(c))) * 44 + 120)
  const flowOf = (id: string) => Math.max(kept.filter((l) => l.source === id).reduce((x, l) => x + l.value, 0), kept.filter((l) => l.target === id).reduce((x, l) => x + l.value, 0))
  const byCol: FlowNode[][] = Array.from({ length: cols }, () => [])
  for (const n of used) byCol[layer.get(n.id) ?? 0].push(n)
  const scale = Math.min(...byCol.filter((c) => c.length).map((c) => (H - TOP * 2 - PADY * (c.length - 1)) / c.reduce((x, n) => x + flowOf(n.id), 0)))
  const pos = new Map<string, { x: number; y: number; h: number }>()
  byCol.forEach((c, ci) => {
    const total = c.reduce((x, n) => x + flowOf(n.id) * scale, 0) + PADY * (c.length - 1)
    let yy = (H - total) / 2
    for (const n of c) {
      const h = Math.max(2, flowOf(n.id) * scale)
      pos.set(n.id, { x: cols === 1 ? 0 : (ci * (W - NW - 110)) / (cols - 1) + 4, y: yy, h })
      yy += h + PADY
    }
  })
  const outOff = new Map<string, number>(), inOff = new Map<string, number>()
  const sorted = [...kept].sort((a, b) => (pos.get(a.target)?.y ?? 0) - (pos.get(b.target)?.y ?? 0) || (pos.get(a.source)?.y ?? 0) - (pos.get(b.source)?.y ?? 0))
  const color = (id: string) => nodes.find((n) => n.id === id)?.color ?? '#8E8E93'
  return (
    <div className="sankey-scroll">
      <svg viewBox={`0 0 ${W} ${H}`} className="sankey" role="img" aria-label="本月資金流向">
        {sorted.map((l, k) => {
          const s = pos.get(l.source)!, t = pos.get(l.target)!
          const w = Math.max(1, l.value * scale)
          const so = outOff.get(l.source) ?? 0, to = inOff.get(l.target) ?? 0
          outOff.set(l.source, so + w); inOff.set(l.target, to + w)
          const x0 = s.x + NW, x1 = t.x, y0 = s.y + so + w / 2, y1 = t.y + to + w / 2, mx = (x0 + x1) / 2
          const on = !active || active === l.source || active === l.target
          return (
            <path key={k} d={`M${x0},${y0 - w / 2} C${mx},${y0 - w / 2} ${mx},${y1 - w / 2} ${x1},${y1 - w / 2} L${x1},${y1 + w / 2} C${mx},${y1 + w / 2} ${mx},${y0 + w / 2} ${x0},${y0 + w / 2} Z`} fill={color(l.source)} fillOpacity={on ? 0.3 : 0.07}>
              <title>{`${nodes.find((n) => n.id === l.source)?.label} → ${nodes.find((n) => n.id === l.target)?.label}：${money(l.value, hidden)}`}</title>
            </path>
          )
        })}
        {used.map((n) => {
          const p = pos.get(n.id)!
          const last = (layer.get(n.id) ?? 0) === cols - 1
          return (
            <g key={n.id} onMouseEnter={() => setActive(n.id)} onMouseLeave={() => setActive(null)} onClick={() => setActive(active === n.id ? null : n.id)} style={{ cursor: 'pointer' }}>
              <rect x={p.x} y={p.y} width={NW} height={p.h} rx={3} fill={n.color} />
              <text x={last ? p.x + NW + 6 : p.x + NW + 5} y={p.y + p.h / 2 - 3} className="sk-label">{n.label}</text>
              <text x={last ? p.x + NW + 6 : p.x + NW + 5} y={p.y + p.h / 2 + 10} className="sk-val">{money(flowOf(n.id), hidden)}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

const SERIES = { income: ['收入', '#34C759'], expense: ['支出', '#FF9F0A'], transfer: ['轉帳', '#8E8E93'] } as const
type SKey = keyof typeof SERIES

/** 收支趨勢：依區間長度自動以「日」或「月」為單位的分組長條圖 */
export function TrendChart({ series, keys }: { series: { key: string; label: string; income: number; expense: number; transfer: number }[]; keys: SKey[] }) {
  const { hidden } = useStore()
  const [hover, setHover] = useState<number | null>(null)
  const n = series.length
  if (!n) return null
  const W = Math.max(340, n * (keys.length * 7 + 6) + 16), H = 190, P = { l: 8, r: 8, t: 34, b: 24 }
  const max = Math.max(1, ...series.flatMap((d) => keys.map((k) => d[k])))
  const slot = (W - P.l - P.r) / n
  const bw = Math.max(2, Math.min(16, (slot - 4) / keys.length))
  const y = (v: number) => P.t + (1 - v / max) * (H - P.t - P.b)
  const step = Math.ceil(n / 12)
  const i = hover
  const d = i !== null ? series[i] : null
  const tot = (k: SKey) => series.reduce((x, r) => x + r[k], 0)
  return (
    <div className="trend">
      <div className="inv-legend small">
        <span className="legend-inline">{keys.map((k) => <span key={k}><i className="dot" style={{ background: SERIES[k][1] }} />{SERIES[k][0]}　</span>)}</span>
        <span className="muted">
          {d ? `${d.label}：` : '合計：'}
          {keys.map((k) => `${SERIES[k][0]} ${hidden ? '••••' : kfmt(d ? d[k] : tot(k))}`).join(' · ')}
        </span>
      </div>
      <div className="sankey-scroll">
        <svg viewBox={`0 0 ${W} ${H}`} className="chart" style={{ minWidth: W > 520 ? W * 0.8 : undefined }} role="img" aria-label="收支趨勢">
          <line x1={P.l} x2={W - P.r} y1={H - P.b} y2={H - P.b} stroke="#E5E5EA" />
          {series.map((r, k) => {
            const x0 = P.l + k * slot + (slot - bw * keys.length) / 2
            return (
              <g key={r.key} onMouseEnter={() => setHover(k)} onMouseLeave={() => setHover(null)} onClick={() => setHover(hover === k ? null : k)} style={{ cursor: 'pointer' }}>
                <rect x={P.l + k * slot} y={0} width={slot} height={H} fill={hover === k ? '#F2F2F7' : 'transparent'} />
                {keys.map((key, j) => (
                  <rect key={key} x={x0 + j * bw} y={y(r[key])} width={Math.max(1, bw - 1)} height={Math.max(0, H - P.b - y(r[key]))} rx={Math.min(3, bw / 3)} fill={SERIES[key][1]} />
                ))}
                {(k % step === 0 || k === n - 1) && <text x={P.l + k * slot + slot / 2} y={H - 7} textAnchor="middle" className="axis">{r.label}</text>}
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}

/** 排行長條 */
export function RankBars({ data, color, empty }: { data: { key: string; value: number; sub?: string }[]; color?: string; empty: string }) {
  const { hidden } = useStore()
  const max = Math.max(1, ...data.map((d) => d.value))
  const total = data.reduce((x, d) => x + d.value, 0)
  if (!data.length) return <p className="empty">{empty}</p>
  return (
    <div className="rank-bars">
      {data.map((d, i) => (
        <div key={d.key} className="rank-bar">
          <div className="row-split small">
            <span><span className="rank">{i + 1}</span>{d.key}{d.sub && <span className="muted"> · {d.sub}</span>}</span>
            <span className="num">{money(d.value, hidden)} <span className="muted">{total ? Math.round((d.value / total) * 100) : 0}%</span></span>
          </div>
          <div className="bar-track"><div className="bar-fill" style={{ width: `${(d.value / max) * 100}%`, background: color ?? catMeta(d.key).color }} /></div>
        </div>
      ))}
    </div>
  )
}

const TOTAL_TYPES = [
  { key: 'income', label: '收入', color: '#5AC8FA' },
  { key: 'transfer', label: '轉帳', color: '#FFCC00' },
  { key: 'expense', label: '支出', color: '#FF6B5B' },
] as const
type TotalKey = (typeof TOTAL_TYPES)[number]['key']

/** 「總計」總覽：收入／轉帳／支出 三類佔比圓環 + 收支結餘 + 可點進細看的進度條列 */
export function TotalOverview({ income, expense, transfer, onPick }: { income: number; expense: number; transfer: number; onPick: (k: TotalKey) => void }) {
  const { hidden } = useStore()
  const vals: Record<TotalKey, number> = { income, expense, transfer }
  const sum = income + expense + transfer
  const rows = TOTAL_TYPES.map((t) => ({ ...t, value: vals[t.key], share: sum ? vals[t.key] / sum : 0 })).sort((a, b) => b.value - a.value)
  const net = income - expense
  const pctTxt = (r: number) => `${(r * 100).toFixed(2)}%`
  const CX = 110, CY = 110, RO = 100, RI = 52
  const pt = (r: number, a: number) => [CX + r * Math.sin(a), CY - r * Math.cos(a)]
  let acc = 0
  const slices = TOTAL_TYPES.map((t) => {
    const share = sum ? vals[t.key] / sum : 0
    const a0 = acc * 2 * Math.PI, a1 = (acc + share) * 2 * Math.PI
    acc += share
    return { ...t, share, a0, a1 }
  }).filter((x) => x.share > 0)
  const arc = (a0: number, a1: number) => {
    if (a1 - a0 >= 2 * Math.PI - 1e-6) a1 = a0 + 2 * Math.PI - 1e-4
    const large = a1 - a0 > Math.PI ? 1 : 0
    const [x0, y0] = pt(RO, a0), [x1, y1] = pt(RO, a1), [x2, y2] = pt(RI, a1), [x3, y3] = pt(RI, a0)
    return `M${x0},${y0} A${RO},${RO} 0 ${large} 1 ${x1},${y1} L${x2},${y2} A${RI},${RI} 0 ${large} 0 ${x3},${y3} Z`
  }
  return (
    <div className="total-ov">
      <svg viewBox="0 0 220 220" className="total-donut" role="img" aria-label="收入、轉帳、支出佔比">
        {!sum && <circle cx={CX} cy={CY} r={(RO + RI) / 2} fill="none" stroke="#F2F2F7" strokeWidth={RO - RI} />}
        {slices.map((s) => (
          <path key={s.key} d={arc(s.a0, s.a1)} fill={s.color} stroke="#fff" strokeWidth={slices.length > 1 ? 1.5 : 0} style={{ cursor: 'pointer' }} onClick={() => onPick(s.key)}>
            <title>{`${s.label} ${pctTxt(s.share)}`}</title>
          </path>
        ))}
        {slices.filter((s) => s.share >= 0.04).map((s) => {
          const [x, y] = pt((RO + RI) / 2, (s.a0 + s.a1) / 2)
          return <text key={s.key} x={x} y={y + 4} textAnchor="middle" className="total-pct">{pctTxt(s.share)}</text>
        })}
      </svg>
      <div className="total-net">
        <span className="strong">總計（收支結餘） -</span>
        <span className={`num strong ${net >= 0 ? 'pos' : 'neg'}`}>{money(net, hidden, { sign: true })}</span>
      </div>
      <p className="muted tiny total-note">總計＝收入 − 支出。轉帳只是自己帳戶間移動，計入佔比但不計入總計；分帳只算你的份額。</p>
      <div className="total-rows">
        {rows.map((r) => (
          <button key={r.key} className="total-row" onClick={() => onPick(r.key)}>
            <span className="total-row-top">
              <span><b>{r.label}</b> - {money(r.value, hidden)}</span>
              <span className="num muted">{pctTxt(r.share)}</span>
              <IconChevronR />
            </span>
            <span className="bar-track"><span className="bar-fill" style={{ width: `${r.share * 100}%`, background: r.color, display: 'block' }} /></span>
          </button>
        ))}
      </div>
    </div>
  )
}

const IconChevronR = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C7C7CC" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
)
