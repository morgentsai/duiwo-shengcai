import { useRef, useState } from 'react'
import { useStore } from '../store'

export const AVATAR_EMOJIS = ['🌸', '🪙', '💰', '🐷', '🦊', '🐱', '🐶', '🐰', '🐻', '🌻', '🍀', '⭐', '🌙', '☕', '🎀', '💎']

/** 目前要顯示的名稱與頭像（沒設定時用 Google 帳號名稱或預設值） */
export function useProfile() {
  const { state, userEmail } = useStore()
  const p = state.profile ?? {}
  const name = p.name?.trim() || (userEmail ? userEmail.split('@')[0] : '我')
  return { name, emoji: p.emoji || '🌸', photo: p.photo }
}

export function Avatar({ size = 22 }: { size?: number }) {
  const { emoji, photo } = useProfile()
  return photo
    ? <img className="avatar-img" src={photo} alt="" style={{ width: size, height: size }} />
    : <span className="avatar-emoji" style={{ fontSize: size * 0.8, width: size, height: size }}>{emoji}</span>
}

/** 把選到的圖片裁成正方形並縮到 160px，回傳 JPEG data URL（約 10KB，可一起同步） */
function shrink(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const S = 160
      const c = document.createElement('canvas')
      c.width = S; c.height = S
      const k = Math.min(img.width, img.height)
      c.getContext('2d')!.drawImage(img, (img.width - k) / 2, (img.height - k) / 2, k, k, 0, 0, S, S)
      URL.revokeObjectURL(url)
      res(c.toDataURL('image/jpeg', 0.82))
    }
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('讀不到這張圖片')) }
    img.src = url
  })
}

export function ProfileCard() {
  const { state, setProfile, flash } = useStore()
  const { name } = useProfile()
  const p = state.profile ?? {}
  const [draft, setDraft] = useState(p.name ?? '')
  const fileRef = useRef<HTMLInputElement>(null)

  const onFile = async (f?: File) => {
    if (!f) return
    try {
      setProfile({ photo: await shrink(f) })
      flash('頭貼已更新')
    } catch (e) {
      flash((e as Error).message)
    }
  }
  const saveName = () => {
    const v = draft.trim().slice(0, 20)
    setProfile({ name: v || undefined })
    flash(v ? `顯示名稱改為「${v}」` : '已改回預設名稱')
  }

  return (
    <section className="card profile-card">
      <div className="profile-hero">
        <Avatar size={84} />
        <div className="profile-name">{name}</div>
      </div>

      <h3 className="pref-h">顯示名稱</h3>
      <div className="list-actions">
        <input className="input" value={draft} maxLength={20} placeholder={name} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveName()} />
        <button className="btn small primary" onClick={saveName}>儲存</button>
      </div>

      <h3 className="pref-h">頭貼</h3>
      <div className="list-actions">
        <button className="btn small primary" onClick={() => fileRef.current?.click()}>上傳照片</button>
        {p.photo && <button className="btn small ghost" onClick={() => setProfile({ photo: undefined })}>移除照片</button>}
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = '' }} />
      </div>
      <p className="muted tiny">{p.photo ? '目前使用照片；移除後會顯示下面選的圖示。' : '或選一個圖示：'}</p>
      <div className="emoji-grid">
        {AVATAR_EMOJIS.map((e) => (
          <button key={e} className={`emoji-opt ${!p.photo && (p.emoji || '🌸') === e ? 'on' : ''}`} onClick={() => setProfile({ emoji: e, photo: undefined })} aria-label={`使用 ${e}`}>{e}</button>
        ))}
      </div>
      <p className="muted tiny">名稱與頭貼會跟著雲端同步，換手機或電腦登入同一個 Google 帳號都會看到。</p>
    </section>
  )
}
