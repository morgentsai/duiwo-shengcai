import { useState } from 'react'
import type { CatDef, Grp } from '../types'
import { GROUP_META } from '../types'
import { useStore } from '../store'
import { groupOf } from '../logic'
import { addCat, addSub, deleteCat, deleteSub, hideSub, mergeCat, moveCat, moveSub, patchCat, renameCat, reorderSub, restoreDefaults, usedCount } from '../catops'
import type { OpResult } from '../catops'
import { Segmented } from './ui'
import { IconChevron, IconChevronL } from './icons'

const EMOJIS = ['🍱', '🍜', '🧋', '☕', '🍰', '🛒', '👗', '👟', '💄', '💇', '🏠', '🧻', '💡', '🐶', '🐱', '🚌', '🚗', '🛵', '⛽', '✈️', '🚄', '📚', '💻', '📱', '🎧', '🎈', '🎬', '🎮', '🧸', '🔮', '🩺', '💊', '🛡️', '🎁', '🧧', '🙏', '👨‍👩‍👧', '👵', '🎂', '🏖️', '🧳', '🐷', '💰', '🏷️', '🧩', '⭐']
const flip = (g: Grp): Grp => (g === 'fixed' ? 'variable' : 'fixed')

/** 設定 › 分類與子分類：清單 → 單一分類編輯 */
export function CatManager() {
  const { state, expCats, catOp, flash } = useStore()
  const [open, setOpen] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const run = (f: Parameters<typeof catOp>[0]) => {
    const r = catOp(f)
    flash(r.ok ? r.msg : r.error)
    return r
  }
  const cur = open ? expCats.find((c) => c.key === open) : undefined
  if (open && cur) return <CatEdit cat={cur} back={() => setOpen(null)} onRenamed={setOpen} run={run} />

  return (
    <>
      <div className="set-group">
        {expCats.map((c) => {
          const g = groupOf(state.groupMap, c.key)
          const n = usedCount(state, c.key)
          return (
            <button key={c.key} className={`set-row cat-row ${c.hidden ? 'is-hidden' : ''}`} onClick={() => setOpen(c.key)} aria-label={`編輯分類 ${c.key}`}>
              <span className="set-icon plain">{c.emoji}</span>
              <span className="set-title">
                <span>{c.key}{c.custom && <span className="tag">自訂</span>}{c.hidden && <span className="tag muted-tag">已隱藏</span>}</span>
                <span className="set-sub">{c.subs.length} 個子分類・預設{GROUP_META[g].short}・{n} 筆</span>
              </span>
              <IconChevron className="chev" size={16} />
            </button>
          )
        })}
      </div>
      {adding ? (
        <div className="inline-add">
          <input autoFocus value={newName} placeholder="新分類名稱（例如：寵物）" maxLength={10} onChange={(e) => setNewName(e.target.value)} aria-label="新分類名稱" />
          <button className="btn small primary" disabled={!newName.trim()} onClick={() => { const r = run((s) => addCat(s, newName)); if (r.ok) { setAdding(false); setOpen(newName.trim()); setNewName('') } }}>新增</button>
          <button className="btn small ghost" onClick={() => setAdding(false)}>取消</button>
        </div>
      ) : (
        <div className="list-actions center">
          <button className="btn ghost small" onClick={() => setAdding(true)}>＋ 新增分類</button>
          <button className="btn ghost small" onClick={() => window.confirm('補回被刪除的內建分類？你自訂或改過名的分類不會被動到。') && run(restoreDefaults)}>恢復預設分類</button>
        </div>
      )}
      <p className="set-foot">點分類可改名、換圖示、排序、隱藏、刪除，也能編輯每個子分類。改名會同步更新所有紀錄、上限、預設值與常用項目。</p>
    </>
  )
}

function CatEdit({ cat, back, onRenamed, run }: { cat: CatDef; back: () => void; onRenamed: (k: string) => void; run: (f: (s: import('../types').AppState) => OpResult) => OpResult }) {
  const { state, expCats, catEdit, setGroup, flash } = useStore()
  const [name, setName] = useState(cat.key)
  const [emoji, setEmoji] = useState('')
  const [newSub, setNewSub] = useState('')
  const [editSub, setEditSub] = useState<string | null>(null)
  const [del, setDel] = useState(false)
  const [delTo, setDelTo] = useState('')
  const idx = expCats.findIndex((c) => c.key === cat.key)
  const g = groupOf(state.groupMap, cat.key)
  const count = usedCount(state, cat.key)
  const others = expCats.filter((c) => c.key !== cat.key)

  const rename = () => {
    const r = run((s) => renameCat(s, cat.key, name))
    if (r.ok) onRenamed(name.trim())
    else if (r.conflict === 'cat' && window.confirm(`已經有「${name.trim()}」分類。要把「${cat.key}」整個合併進去嗎？（紀錄、子分類與上限都會一起併入，上限相加）`)) {
      const m = run((s) => mergeCat(s, cat.key, name.trim()))
      if (m.ok) onRenamed(name.trim())
    }
  }

  return (
    <div className="cat-edit">
      <button className="set-back" onClick={back}><IconChevronL size={18} /> 全部分類</button>
      <div className="cat-edit-head">
        <span className="cat-big">{cat.emoji}</span>
        <div>
          <h3 className="set-sub-title">{cat.key}</h3>
          <span className="muted small">{count} 筆紀錄・第 {idx + 1}／{expCats.length} 個</span>
        </div>
      </div>

      <div className="set-group-h">名稱</div>
      <div className="set-group pad">
        <div className="inline-add">
          <input value={name} maxLength={10} onChange={(e) => setName(e.target.value)} aria-label="分類名稱" />
          <button className="btn small primary" disabled={!name.trim() || name.trim() === cat.key} onClick={rename}>改名</button>
        </div>
        <p className="muted tiny">改名會同步更新 {count} 筆紀錄、上限、記帳預設值、常用項目與三大類設定。</p>
      </div>

      <div className="set-group-h">圖示</div>
      <div className="set-group pad">
        <div className="emoji-grid">
          {EMOJIS.map((e) => (
            <button key={e} className={`emoji-btn ${cat.emoji === e ? 'on' : ''}`} onClick={() => catEdit((s) => patchCat(s, cat.key, { emoji: e }))} aria-label={`圖示 ${e}`}>{e}</button>
          ))}
        </div>
        <div className="inline-add">
          <input value={emoji} maxLength={4} placeholder="或輸入任何表情符號" onChange={(e) => setEmoji(e.target.value)} aria-label="自訂圖示" />
          <button className="btn small" disabled={!emoji.trim()} onClick={() => { catEdit((s) => patchCat(s, cat.key, { emoji: emoji.trim() })); setEmoji('') }}>套用</button>
        </div>
      </div>

      <div className="set-group-h">設定</div>
      <div className="set-group pad">
        <div className="pref">
          <span className="field-label">三大類預設（沒個別設定的子分類跟著這個）</span>
          <Segmented<Grp> value={g} onChange={(v) => setGroup(`${cat.key}|*`, v)} options={[{ value: 'fixed', label: '固定支出' }, { value: 'variable', label: '變動支出' }]} />
        </div>
        <div className="order-row">
          <span>排序</span>
          <button className="btn small ghost" disabled={idx <= 0} onClick={() => catEdit((s) => moveCat(s, cat.key, -1))}>↑ 上移</button>
          <button className="btn small ghost" disabled={idx >= expCats.length - 1} onClick={() => catEdit((s) => moveCat(s, cat.key, 1))}>↓ 下移</button>
        </div>
        <label className="toggle-row">
          <span>在記帳選單顯示<br /><span className="muted tiny">關閉＝隱藏：記帳時看不到，但舊紀錄與分析照常顯示</span></span>
          <input type="checkbox" className="switch" checked={!cat.hidden} onChange={(e) => { catEdit((s) => patchCat(s, cat.key, { hidden: !e.target.checked || undefined })); flash(e.target.checked ? '已顯示' : '已隱藏（紀錄仍保留）') }} />
        </label>
      </div>

      <div className="set-group-h">子分類（{cat.subs.length}）</div>
      <div className="set-group">
        {cat.subs.map((sb, i) => {
          const sg = groupOf(state.groupMap, cat.key, sb)
          const hid = cat.hiddenSubs?.includes(sb)
          const n = usedCount(state, cat.key, sb)
          return (
            <div key={sb} className={`sub-row ${hid ? 'is-hidden' : ''}`}>
              <div className="sub-row-main">
                <button className={`grp-badge ${sg}`} onClick={() => setGroup(`${cat.key}|${sb}`, flip(sg))} aria-label={`${sb}：${GROUP_META[sg].label}，點一下切換`}>{GROUP_META[sg].short[0]}</button>
                <span className="sub-name">{sb}{hid && <span className="tag muted-tag">隱藏</span>}<span className="muted tiny"> {n} 筆</span></span>
                <button className="icon-btn sm" disabled={i === 0} onClick={() => catEdit((s) => reorderSub(s, cat.key, sb, -1))} aria-label={`${sb} 上移`}>↑</button>
                <button className="icon-btn sm" disabled={i === cat.subs.length - 1} onClick={() => catEdit((s) => reorderSub(s, cat.key, sb, 1))} aria-label={`${sb} 下移`}>↓</button>
                <button className="btn small ghost" onClick={() => setEditSub(editSub === sb ? null : sb)} aria-expanded={editSub === sb}>{editSub === sb ? '收合' : '編輯'}</button>
              </div>
              {editSub === sb && <SubEdit cat={cat} sub={sb} count={n} hidden={!!hid} run={run} done={() => setEditSub(null)} />}
            </div>
          )
        })}
        <div className="inline-add pad">
          <input value={newSub} maxLength={12} placeholder="＋ 新增子分類" onChange={(e) => setNewSub(e.target.value)} aria-label="新增子分類名稱" />
          <button className="btn small primary" disabled={!newSub.trim()} onClick={() => { if (run((s) => addSub(s, cat.key, newSub)).ok) setNewSub('') }}>新增</button>
        </div>
      </div>

      <div className="set-group-h">刪除</div>
      <div className="set-group pad">
        {!del ? (
          <button className="btn small ghost danger" onClick={() => {
            if (count) return setDel(true)
            { const r = run((s) => deleteCat(s, cat.key)); if (r.ok) back() }
          }}>刪除這個分類</button>
        ) : (
          <div className="del-panel">
            <p className="small">「{cat.key}」有 {count} 筆紀錄。要搬到哪個分類？（上限會相加、子分類一起帶過去）</p>
            <select value={delTo} onChange={(e) => setDelTo(e.target.value)} aria-label="搬到哪個分類">
              <option value="">選擇分類…</option>
              {others.map((c) => <option key={c.key} value={c.key}>{c.emoji} {c.key}</option>)}
            </select>
            <div className="list-actions">
              <button className="btn small danger" disabled={!delTo} onClick={() => { const r = run((s) => mergeCat(s, cat.key, delTo)); if (r.ok) back() }}>搬過去並刪除</button>
              <button className="btn small ghost" onClick={() => { catEdit((s) => patchCat(s, cat.key, { hidden: true })); flash('已改成隱藏，紀錄保留'); setDel(false) }}>改成隱藏</button>
              <button className="btn small ghost" onClick={() => setDel(false)}>取消</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function SubEdit({ cat, sub, count, hidden, run, done }: { cat: CatDef; sub: string; count: number; hidden: boolean; run: (f: (s: import('../types').AppState) => OpResult) => OpResult; done: () => void }) {
  const { expCats, catEdit, flash } = useStore()
  const [name, setName] = useState(sub)
  const [toCat, setToCat] = useState(cat.key)
  const [delMode, setDelMode] = useState(false)
  const [target, setTarget] = useState('')
  const targetDef = expCats.find((c) => c.key === toCat)
  const apply = () => {
    const r = run((s) => moveSub(s, cat.key, sub, toCat, name))
    if (!r.ok && r.conflict === 'sub' && window.confirm(`「${toCat}」已經有「${name.trim()}」。要把「${sub}」合併進去嗎？（紀錄與子分類上限會相加）`)) {
      if (run((s) => moveSub(s, cat.key, sub, toCat, name, { merge: true })).ok) done()
    } else if (r.ok) done()
  }
  const doDelete = () => {
    if (!count) {
      if (run((s) => deleteSub(s, cat.key, sub)).ok) done()
      return
    }
    setDelMode(true)
  }
  return (
    <div className="sub-edit">
      <div className="two-col">
        <label className="field"><span className="field-label">名稱</span><input value={name} maxLength={12} onChange={(e) => setName(e.target.value)} aria-label="子分類名稱" /></label>
        <label className="field">
          <span className="field-label">所屬分類</span>
          <select value={toCat} onChange={(e) => setToCat(e.target.value)} aria-label="搬到分類">
            {expCats.map((c) => <option key={c.key} value={c.key}>{c.emoji} {c.key}</option>)}
          </select>
        </label>
      </div>
      {toCat !== cat.key && targetDef?.subs.includes(name.trim()) && <p className="muted tiny">「{toCat}」已有「{name.trim()}」，儲存時會詢問是否合併。</p>}
      <div className="list-actions">
        <button className="btn small primary" disabled={!name.trim() || (name.trim() === sub && toCat === cat.key)} onClick={apply}>儲存（{count} 筆跟著改）</button>
        <button className="btn small ghost" onClick={() => { catEdit((s) => hideSub(s, cat.key, sub, !hidden)); flash(hidden ? '已顯示' : '已隱藏（紀錄仍保留）') }}>{hidden ? '取消隱藏' : '隱藏'}</button>
        <button className="btn small ghost danger" onClick={doDelete}>刪除</button>
      </div>
      {delMode && (
        <div className="del-panel">
          <p className="small">「{sub}」有 {count} 筆紀錄，要搬到哪裡？</p>
          <select value={target} onChange={(e) => setTarget(e.target.value)} aria-label="子分類搬到哪裡">
            <option value="">選擇…</option>
            {expCats.map((c) => (
              <optgroup key={c.key} label={`${c.emoji} ${c.key}`}>
                <option value={`${c.key}|`}>{c.key}（不指定子分類）</option>
                {c.subs.filter((x) => !(c.key === cat.key && x === sub)).map((x) => <option key={x} value={`${c.key}|${x}`}>{x}</option>)}
              </optgroup>
            ))}
          </select>
          <div className="list-actions">
            <button className="btn small danger" disabled={!target} onClick={() => { const [tc, ts] = target.split('|'); if (run((s) => moveSub(s, cat.key, sub, tc, ts, { merge: true })).ok) done() }}>搬過去並刪除</button>
            <button className="btn small ghost" onClick={() => { catEdit((s) => hideSub(s, cat.key, sub, true)); flash('已改成隱藏，紀錄保留'); setDelMode(false) }}>改成隱藏</button>
            <button className="btn small ghost" onClick={() => setDelMode(false)}>取消</button>
          </div>
        </div>
      )}
    </div>
  )
}
