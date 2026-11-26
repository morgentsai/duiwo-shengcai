import { useMemo, useState } from 'react'
import type { Account, Tx } from '../types'
import { useStore } from '../store'
import { brokerStats, cardStatements, dateLabel, money, pct, todayStr, uid } from '../logic'
import { Field, Money, Segmented, Sheet } from './ui'

type Stats = ReturnType<typeof brokerStats>

export function InvestStatGrid({ st, compact }: { st: Stats; compact?: boolean }) {
  const up = st.gain >= 0
  return (
    <div className={`invest-sum ${compact ? 'compact' : ''}`}>
      <div><span className="muted small">累積投入本金</span><Money v={st.principal} className="strong" /></div>
      <div><span className="muted small">目前市值（含交割現金）</span><Money v={st.value} className="strong" /></div>
      <div><span className="muted small">未實現損益</span><Money v={st.unrealized} sign className={st.unrealized >= 0 ? 'pos' : 'neg'} /></div>
      <div>
        <span className="muted small">總報酬率</span>
        <span className={`num ${up ? 'pos' : 'neg'}`}>{st.principal ? pct(st.ret) : '—'}</span>
      </div>
      <div><span className="muted small">累積配息</span><Money v={st.dividends} /></div>
      <div><span className="muted small">總損益（市值−本金）</span><Money v={st.gain} sign className={up ? 'pos' : 'neg'} /></div>
    </div>
  )
}

/* ---------------- 信用卡帳單 ---------------- */
export function StatementSheet({ card, onClose }: { card: Account; onClose: () => void }) {
  const { state, hidden } = useStore()
  const sts = useMemo(() => cardStatements(state, card, 3), [state, card])
  const [i, setI] = useState<'0' | '1' | '2'>('1')
  const st = sts[Number(i)]
  const today = todayStr()
  const fmt = (d: string) => d.slice(5).replace('-', '/')
  const label = i === '0' ? '未出帳（累積中）' : i === '1' ? '本期帳單' : '上期帳單'
  return (
    <Sheet open onClose={onClose} title={`${card.name} 帳單`}>
      <Segmented<'0' | '1' | '2'>
        value={i}
        onChange={setI}
        options={[
          { value: '0', label: '未出帳' },
          { value: '1', label: '本期帳單' },
          { value: '2', label: '上期帳單' },
        ]}
      />
      <div className="stmt-head">
        <div className="muted small">{label} · 刷卡期間 {fmt(st.start)}–{fmt(st.closing)}</div>
        <Money v={st.total} className="hero-num" />
        <div className="stmt-meta">
          <span>結帳日 {st.closing.replace(/-/g, '/')}</span>
          <span>扣款日 {st.due.replace(/-/g, '/')}</span>
          <span className={`pill ${st.due < today ? 'gray' : st.closing < today ? 'orange' : 'blue'}`}>
            {st.due < today ? '已過扣款日' : st.closing < today ? `${fmt(st.due)} 從${state.accounts.find((a) => a.id === card.payAccountId)?.name ?? '扣繳帳戶'}扣款` : '尚未結帳'}
          </span>
        </div>
        <p className="hint">這期刷的錢會在 {st.due.slice(0, 7).replace('-', ' 年 ')} 月真正從銀行扣款；分析頁切到「實際扣款」就是用這個月份計算。</p>
      </div>
      <div className="stmt-list">
        {st.txs.length === 0 && <p className="empty">這期沒有刷卡紀錄</p>}
        {st.txs.map((t) => (
          <div key={t.id} className="stmt-row">
            <span className="muted small num">{fmt(t.date)}</span>
            <span className="row-main">
              <span>{t.note || t.sub || t.category}</span>
              <span className="row-sub">{[t.category, t.sub].filter(Boolean).join('・')}{t.share ? ` · 分帳（我 ${money(t.share.mine, hidden)}）` : ''}</span>
            </span>
            <span className="num">{money(t.amount, hidden)}</span>
          </div>
        ))}
      </div>
    </Sheet>
  )
}

/* ---------------- 證券交易 ---------------- */
export type TradeKind = 'deposit' | 'buy' | 'sell' | 'dividend'

const autoFee = (gross: number, sell: boolean) => (gross > 0 ? Math.max(20, Math.round(gross * 0.001425)) + (sell ? Math.round(gross * 0.001) : 0) : 0)

export function TradeSheet({ broker, initial, onClose }: { broker: Account; initial: TradeKind; onClose: () => void }) {
  const { state, addTx, addTxs, flash, hidden } = useStore()
  const holdings = state.holdings.filter((h) => h.brokerId === broker.id)
  const banks = state.accounts.filter((a) => a.kind === 'bank' && !a.currency)
  const [kind, setKind] = useState<TradeKind>(initial)
  const [date, setDate] = useState(todayStr())
  const [from, setFrom] = useState('mega')
  const [amount, setAmount] = useState(String(broker.monthlyTarget || ''))
  const [symbol, setSymbol] = useState(holdings[0]?.symbol ?? '')
  const [name, setName] = useState(holdings[0]?.name ?? '')
  const [shares, setShares] = useState('')
  const [price, setPrice] = useState(holdings[0] ? String(holdings[0].price) : '')
  const [fee, setFee] = useState('')
  const [reinvest, setReinvest] = useState(false)
  const held = holdings.find((h) => h.symbol === symbol)

  const q = Number(shares) || 0
  const p = Number(price) || 0
  const gross = q * p
  const feeN = fee === '' ? autoFee(gross, kind === 'sell') : Number(fee) || 0
  const pickHolding = (sym: string) => {
    setSymbol(sym)
    const h = holdings.find((x) => x.symbol === sym)
    if (h) { setName(h.name); setPrice(String(h.price)) }
  }
  const tradeTx = (k: 'buy' | 'sell'): Omit<Tx, 'id'> => {
    const sym = symbol.trim().toUpperCase()
    const nm = name.trim() || sym
    const amt = Math.round(k === 'buy' ? gross + feeN : gross - feeN)
    return {
      type: 'transfer', date, amount: amt, tag: 'trade', category: '證券交易', sub: k === 'buy' ? '買進' : '賣出',
      ...(k === 'buy' ? { fromId: broker.id } : { toId: broker.id }),
      note: `${k === 'buy' ? '買進' : '賣出'} ${sym} ${q.toLocaleString()} 股 @ ${p}`,
      trade: { kind: k, brokerId: broker.id, symbol: sym, name: nm, shares: q, price: p, fee: feeN },
    }
  }

  const save = () => {
    if (kind === 'deposit') {
      const a = Math.round(Number(amount) || 0)
      if (a <= 0) return flash('請輸入金額')
      addTx({ type: 'transfer', date, amount: a, fromId: from, toId: broker.id, category: '投資', sub: '投入', note: `投入本金到${broker.name}`, tag: broker.monthlyTarget ? 'etf' : undefined })
      flash(`已投入本金 ${money(a, hidden)}`)
    } else if (kind === 'buy' || kind === 'sell') {
      if (!symbol.trim() || q <= 0 || p <= 0) return flash('請填寫標的、股數與成交價')
      if (kind === 'sell' && (!held || q > held.shares)) return flash(`持有股數不足（目前 ${held?.shares ?? 0} 股）`)
      const t = tradeTx(kind)
      if (kind === 'buy' && broker.balance < t.amount && !window.confirm(`交割現金 ${money(broker.balance)} 不足 ${money(t.amount)}，仍要記錄？（建議先記「入金」）`)) return
      addTx(t)
      flash(kind === 'buy' ? '已記錄買進，持倉均價已更新' : '已記錄賣出')
    } else {
      const a = Math.round(Number(amount) || 0)
      if (a <= 0 || !symbol) return flash('請選擇標的並輸入配息金額')
      const div: Omit<Tx, 'id'> = {
        type: 'income', date, amount: a, toId: broker.id, category: '投資配息/折讓/獲利', sub: '配息', tag: 'dividend', note: `${symbol} 配息`,
        trade: { kind: 'dividend', brokerId: broker.id, symbol, name: held?.name ?? symbol, shares: 0, price: 0, fee: 0 },
      }
      if (reinvest) {
        if (q <= 0 || p <= 0) return flash('再投入請填股數與成交價')
        addTxs([div, tradeTx('buy')], { id: `div-${uid()}`, title: `${symbol} 配息再投入` })
      } else addTx(div)
      flash(reinvest ? '已記錄配息並再投入' : '已記錄配息')
    }
    onClose()
  }

  const holdingSelect = (
    <Field label="標的">
      <select value={symbol} onChange={(e) => pickHolding(e.target.value)}>
        {holdings.map((h) => <option key={h.id} value={h.symbol}>{h.symbol} {h.name}（{h.shares.toLocaleString()} 股）</option>)}
      </select>
    </Field>
  )
  const priceFields = (
    <>
      <div className="two-col">
        <Field label="股數">
          <input inputMode="decimal" type="number" value={shares} onChange={(e) => setShares(e.target.value)} placeholder="0" />
        </Field>
        <Field label="成交價">
          <input inputMode="decimal" type="number" step="any" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0" />
        </Field>
      </div>
      <Field label={kind === 'sell' ? '手續費＋交易稅' : '手續費'} hint={fee === '' ? `自動估算 ${money(feeN, hidden)}（可自行修改）` : undefined}>
        <input inputMode="numeric" type="number" value={fee} onChange={(e) => setFee(e.target.value)} placeholder={String(feeN)} />
      </Field>
      {gross > 0 && (
        <div className="row-split strong">
          <span>{kind === 'sell' ? '入帳金額' : '交割金額'}</span>
          <span className="num">{money(Math.round(kind === 'sell' ? gross - feeN : gross + feeN), hidden)}</span>
        </div>
      )}
    </>
  )

  return (
    <Sheet open onClose={onClose} title={broker.name} footer={<button className="btn primary grow" style={{ width: '100%' }} onClick={save}>儲存</button>}>
      <Segmented<TradeKind>
        value={kind}
        onChange={setKind}
        options={[
          { value: 'deposit', label: '入金' },
          { value: 'buy', label: '買進' },
          { value: 'sell', label: '賣出' },
          { value: 'dividend', label: '配息' },
        ]}
      />
      <p className="muted small">交割現金 {money(broker.balance, hidden)}{held ? ` · ${held.symbol} 持有 ${held.shares.toLocaleString()} 股、均價 ${held.cost}` : ''}</p>

      {kind === 'deposit' && (
        <>
          <div className="two-col">
            <Field label="從哪個帳戶">
              <select value={from} onChange={(e) => setFrom(e.target.value)}>
                {banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </Field>
            <Field label="金額"><input inputMode="numeric" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          </div>
          <p className="hint">入金＝投入本金。錢從銀行移到證券交割戶，不算支出；成交後再記一筆「買進」。</p>
        </>
      )}

      {kind === 'buy' && (
        <>
          <div className="two-col">
            <Field label="代號">
              <input list="hold-syms" value={symbol} onChange={(e) => pickHolding(e.target.value)} placeholder="0050" />
              <datalist id="hold-syms">{holdings.map((h) => <option key={h.id} value={h.symbol}>{h.name}</option>)}</datalist>
            </Field>
            <Field label="名稱"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="元大台灣50" /></Field>
          </div>
          {priceFields}
        </>
      )}

      {kind === 'sell' && (
        <>
          {holdingSelect}
          {priceFields}
          {held && q > 0 && p > 0 && (
            <p className="hint">預估已實現損益 {money(q * (p - held.cost) - feeN, hidden, { sign: true })}</p>
          )}
        </>
      )}

      {kind === 'dividend' && (
        <>
          {holdingSelect}
          <Field label="配息金額（入交割戶）"><input inputMode="numeric" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          <label className="toggle-row">
            <span>配息再投入（同時記一筆買進）</span>
            <input type="checkbox" className="switch" checked={reinvest} onChange={(e) => setReinvest(e.target.checked)} />
          </label>
          {reinvest && priceFields}
          <p className="hint">配息記為投資收益（收入），不算消費；累積配息會顯示在證券戶統計。</p>
        </>
      )}

      <Field label="日期"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      <p className="muted tiny">{dateLabel(date)}</p>
    </Sheet>
  )
}
