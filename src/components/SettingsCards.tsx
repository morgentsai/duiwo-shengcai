import { useRef, useState } from 'react'
import type { Tx } from '../types'
import { convertAndroMoney, readCsvFile } from '../andromoney'
import { resolveAlias } from '../catops'
import { useStore, validState } from '../store'
import { fmtTaipei, todayStr } from '../logic'
import { buildExportCsv, buildTemplateCsv, parseTemplate, type TemplateRow } from '../csvTemplate'
import { IconCloud } from './icons'

function downloadText(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

/** 記帳模板：下載空白模板、匯入（逐列檢查）、匯出既有紀錄 */
export function TemplateCard() {
  const { state, expCats, addTxs, flash } = useStore()
  const ref = useRef<HTMLInputElement>(null)
  const [pv, setPv] = useState<{ name: string; header: string | null; rows: TemplateRow[] } | null>(null)
  const valid = pv ? pv.rows.filter((r) => r.tx).map((r) => r.tx as Omit<Tx, 'id'>) : []
  const errors = pv ? pv.rows.filter((r) => r.error) : []
  const onFile = async (f?: File) => {
    if (!f) return
    try {
      const text = await readCsvFile(f)
      const r = parseTemplate(text, state, expCats)
      setPv({ name: f.name, header: r.header, rows: r.rows })
    } catch {
      flash('讀取檔案失敗')
    }
    if (ref.current) ref.current.value = ''
  }
  const doImport = () => {
    if (!valid.length) return
    addTxs(valid)
    flash(`已匯入 ${valid.length} 筆紀錄`)
    setPv(null)
  }
  return (
    <section className="card">
      <p className="muted small">一次輸入很多筆時，先下載模板，在 Excel 或 Google 試算表填好後存成 CSV 再匯入。日期 2026-11-25、類型填「支出／收入／轉帳」，帳戶與分類請用 App 裡的名稱。錯誤的列會標出行號，正確的列才會匯入。</p>
      <div className="list-actions">
        <button className="btn small ghost" onClick={() => downloadText('morgen-記帳模板.csv', buildTemplateCsv(state))}>下載記帳模板</button>
        <button className="btn small ghost" onClick={() => ref.current?.click()}>匯入記帳 CSV</button>
        <input ref={ref} type="file" accept=".csv,text/csv" hidden onChange={(e) => onFile(e.target.files?.[0])} />
        <button className="btn small ghost" onClick={() => downloadText(`morgen-記帳匯出-${todayStr()}.csv`, buildExportCsv(state))}>匯出記帳 CSV</button>
      </div>
      {pv && (
        <div className="import-preview">
          <div className="strong">「{pv.name}」</div>
          {pv.header ? (
            <div className="small warn">{pv.header}</div>
          ) : (
            <>
              <div className="small">可匯入 <b>{valid.length}</b> 筆，<b>{errors.length}</b> 列有問題</div>
              {errors.length > 0 && (
                <ul className="small warn" style={{ margin: '4px 0', paddingLeft: 18 }}>
                  {errors.slice(0, 12).map((r) => <li key={r.line}>第 {r.line} 列：{r.error}</li>)}
                  {errors.length > 12 && <li>…還有 {errors.length - 12} 列</li>}
                </ul>
              )}
            </>
          )}
          <div className="list-actions" style={{ padding: 0 }}>
            <button className="btn small ghost" onClick={() => setPv(null)}>取消</button>
            <button className="btn small primary" disabled={!valid.length} onClick={doImport}>匯入 {valid.length} 筆</button>
          </div>
        </div>
      )}
    </section>
  )
}

export function SyncCard() {
  const { userEmail, syncStatus, syncError, lastSynced, signIn, signOut, syncNow } = useStore()
  const label = { off: '未登入', idle: '待同步', syncing: '同步中…', ok: '已同步', error: '同步失敗' }[syncStatus]
  return (
    <section className="card">
      <div className="card-head">
        <h2><IconCloud size={18} /> 雲端同步</h2>
        <span className={`pill ${syncStatus === 'ok' ? 'green' : syncStatus === 'error' ? 'red' : syncStatus === 'off' ? 'gray' : 'blue'}`}>{label}</span>
      </div>
      {!userEmail ? (
        <>
          <p className="muted small">用 Google 帳號登入後，手機和電腦登入同一個帳號就會自動同步。未登入時，資料只存在這台裝置。</p>
          <div className="list-actions">
            <button className="btn small primary" onClick={signIn}>使用 Google 登入</button>
          </div>
        </>
      ) : (
        <>
          <div className="row-split"><span className="muted small">登入帳號</span><span className="num small">{userEmail}</span></div>
          <div className="row-split"><span className="muted small">最後同步（台北時間）</span><span className="num small">{lastSynced ? fmtTaipei(lastSynced) : '—'}</span></div>
          <div className="list-actions">
            <button className="btn small primary" disabled={syncStatus === 'syncing'} onClick={syncNow}>立即同步</button>
            <button className="btn small ghost" onClick={() => window.confirm('登出 Google 帳號？此裝置的資料會保留，但不再同步。') && signOut()}>登出</button>
          </div>
        </>
      )}
      {syncStatus === 'error' && syncError && <p className="small neg">{syncError}</p>}
      <p className="muted tiny">資料經過 Google 登入後才能讀寫，且只有你的帳號能存取自己的資料。</p>
    </section>
  )
}

export function DataCard() {
  const { state, importState, importTxs, flash } = useStore()
  const fileRef = useRef<HTMLInputElement>(null)
  const csvRef = useRef<HTMLInputElement>(null)
  const [applyBal, setApplyBal] = useState(false)
  const [preview, setPreview] = useState<{ name: string; txs: Tx[]; newAccounts: import('../types').Account[]; fresh: number; skipped: number; unknown: string[]; range: [string, string] | null } | null>(null)
  const onCsv = async (f?: File) => {
    if (!f) return
    try {
      const r = convertAndroMoney(await readCsvFile(f), state.accounts, (c, sb) => resolveAlias(state, c, sb))
      const have = new Set(state.txs.map((t) => t.id))
      setPreview({ name: f.name, txs: r.txs, newAccounts: r.newAccounts, fresh: r.txs.filter((t) => !have.has(t.id)).length, skipped: r.skipped, unknown: r.unknownAccounts, range: r.range })
    } catch (e) {
      flash((e as Error).message || 'CSV 解析失敗')
    }
    if (csvRef.current) csvRef.current.value = ''
  }
  const doImport = () => {
    if (!preview) return
    importTxs(preview.txs, preview.newAccounts, applyBal)
    flash(`已匯入 ${preview.fresh} 筆 AndroMoney 紀錄`)
    setPreview(null)
  }
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `morgen-wealth-backup-${todayStr()}.json`
    a.click()
    URL.revokeObjectURL(url)
    flash('已匯出備份')
  }
  const onFile = async (f?: File) => {
    if (!f) return
    try {
      const data = JSON.parse(await f.text())
      if (!validState(data)) throw new Error('格式不符')
      {
        importState(data)
        flash('已匯入備份')
      }
    } catch {
      flash('檔案格式不正確，無法匯入')
    }
    if (fileRef.current) fileRef.current.value = ''
  }
  return (
    <section className="card">
      <p className="muted small">私人期初餘額檔（例如 morgen-initial-balances.json）與備份檔一樣，用「匯入 JSON」載入；只存在這台裝置與你的同步空間。</p>
      <div className="list-actions">
        <button className="btn small ghost" onClick={exportJson}>匯出 JSON 備份</button>
        <button className="btn small ghost" onClick={() => fileRef.current?.click()}>匯入 JSON（備份／私人期初餘額）</button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => onFile(e.target.files?.[0])} />
        <button className="btn small ghost" onClick={() => csvRef.current?.click()}>匯入 AndroMoney CSV</button>
        <input ref={csvRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => onCsv(e.target.files?.[0])} />
      </div>
      {preview && (
        <div className="import-preview">
          <div className="strong">「{preview.name}」</div>
          <div className="small">
            可匯入 <b>{preview.fresh}</b> 筆（共解析 {preview.txs.length} 筆，略過 {preview.skipped} 筆期初／非台幣）
            {preview.range && <> · {preview.range[0].replace(/-/g, '/')} – {preview.range[1].replace(/-/g, '/')}</>}
          </div>
          {preview.unknown.length > 0 && <div className="small muted">會自動新增帳戶：{preview.unknown.join('、')}</div>}
          <label className="toggle-row">
            <span className="small">同時套用到目前帳戶餘額<br /><span className="muted tiny">建議關閉：只當歷史紀錄，餘額以銀行實際數字為準</span></span>
            <input type="checkbox" className="switch" checked={applyBal} onChange={(e) => setApplyBal(e.target.checked)} />
          </label>
          <div className="list-actions" style={{ padding: 0 }}>
            <button className="btn small ghost" onClick={() => setPreview(null)}>取消</button>
            <button className="btn small primary" disabled={!preview.fresh} onClick={doImport}>匯入 {preview.fresh} 筆</button>
          </div>
        </div>
      )}
      <p className="muted tiny">共 {state.accounts.length} 個帳戶、{state.txs.length} 筆紀錄、{state.holdings.length} 檔持倉 · 本機最後修改 {fmtTaipei(state.updatedAt)}</p>
    </section>
  )
}

export function DemoCard() {
  const { state, clearDemo, loadDemo, flash } = useStore()
  return (
    <section className="card">
      <p className="muted small">{state.isDemo ? '目前顯示的是示範資料。清空後會保留帳戶、信用卡與證券戶結構，餘額與明細歸零。' : '目前是你的正式資料。重載示範資料會覆蓋目前資料，建議先匯出備份。'}</p>
      <div className="list-actions">
        <button
          className="btn small ghost danger"
          onClick={() => (clearDemo(), flash('已清空，可以開始正式記帳'))}
        >
          清空示範資料
        </button>
        <button className="btn small ghost" onClick={() => window.confirm('重新載入示範資料？目前資料會被覆蓋。') && (loadDemo(), flash('已載入示範資料'))}>
          重載示範資料
        </button>
      </div>
    </section>
  )
}
