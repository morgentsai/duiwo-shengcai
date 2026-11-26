import { useEffect, useState } from 'react'

/** 金條與金塊用 SVG 畫（系統沒有對應的 emoji） */
const GOLD_DEF = (
  <defs>
    <linearGradient id="burst-gold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#FFF3B0" />
      <stop offset="0.45" stopColor="#F5C542" />
      <stop offset="1" stopColor="#B8860B" />
    </linearGradient>
  </defs>
)
function GoldBar({ size }: { size: number }) {
  return (
    <svg width={size * 1.5} height={size} viewBox="0 0 60 36" aria-hidden>
      {GOLD_DEF}
      <path d="M12 4 H48 L58 30 H2 Z" fill="url(#burst-gold)" stroke="#9A6F0B" strokeWidth="1.2" />
      <path d="M16 9 H44" stroke="#FFFBE0" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
    </svg>
  )
}
function GoldBlock({ size }: { size: number }) {
  return (
    <svg width={size * 1.3} height={size} viewBox="0 0 52 40" aria-hidden>
      {GOLD_DEF}
      <rect x="2" y="6" width="48" height="30" rx="6" fill="url(#burst-gold)" stroke="#9A6F0B" strokeWidth="1.2" />
      <rect x="10" y="12" width="32" height="8" rx="3" fill="#FFFBE0" opacity="0.55" />
    </svg>
  )
}
/** 美金鈔票：綠色鈔身、橢圓人像框與 $ 字樣 */
function UsdBill({ size }: { size: number }) {
  return (
    <svg width={size * 1.6} height={size} viewBox="0 0 64 40" aria-hidden>
      <rect x="1" y="3" width="62" height="34" rx="3" fill="#5E9E6A" stroke="#2F5D3A" strokeWidth="1.2" />
      <rect x="4" y="6" width="56" height="28" rx="2" fill="none" stroke="#D6EBD9" strokeWidth="1" opacity="0.8" />
      <ellipse cx="32" cy="20" rx="11" ry="10" fill="#8CC79A" stroke="#2F5D3A" strokeWidth="1" />
      <text x="32" y="25" textAnchor="middle" fontSize="15" fontWeight="700" fill="#1F4128" fontFamily="serif">$</text>
      <text x="9" y="13" fontSize="7" fill="#E8F5EA" fontFamily="serif">100</text>
      <text x="55" y="31" textAnchor="end" fontSize="7" fill="#E8F5EA" fontFamily="serif">100</text>
    </svg>
  )
}
function BurstItem({ name, size }: { name: string; size: number }) {
  if (name === 'bar') return <GoldBar size={size} />
  if (name === 'block') return <GoldBlock size={size} />
  if (name === 'usd') return <UsdBill size={size} />
  return <>{name}</>
}

/** 三種情緒：支出＝感謝（愛心上升）、收入＝豐盛（財神送錢飄落）、轉帳＝希望（光點升起） */
export type BurstKind = 'expense' | 'income' | 'hope'

const SETS: Record<BurstKind, { items: string[]; cls: string; n: number; banner: string; scale: number }> = {
  expense: { items: ['❤️', '💖', '🙏', '💗', '🌷'], cls: 'rise', n: 22, banner: '謝謝這份流動，生活因此更好 🙏', scale: 1.3 },
  income: { items: ['bar', '🧧', 'block', 'usd', 'bar', '🧧', 'usd', 'block'], cls: 'fall gold', n: 32, banner: '財神爺送來金光滿滿的一筆 🧧', scale: 1.05 },
  hope: { items: ['🌱', '✨', '🌟', '🕊️', '🌤️'], cls: 'drift', n: 18, banner: '帶著希望，把錢放到更好的地方 🌱', scale: 1.3 },
}

interface Part { id: number; emoji: string; cls: string; x: number; d: number; delay: number; size: number; sway: number }

/** 在記帳成功時呼叫，播放對應的小動畫 */
export function emitBurst(kind: BurstKind) {
  window.dispatchEvent(new CustomEvent<BurstKind>('ledger-burst', { detail: kind }))
}

export function BurstLayer() {
  const [parts, setParts] = useState<Part[]>([])
  const [banner, setBanner] = useState<{ id: number; text: string } | null>(null)

  useEffect(() => {
    const onBurst = (e: Event) => {
      const kind = (e as CustomEvent<BurstKind>).detail
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
      const set = SETS[kind]
      const id = Date.now()
      const next: Part[] = Array.from({ length: set.n }, (_, i) => ({
        id: id + i + Math.random(),
        emoji: set.items[i % set.items.length],
        cls: set.cls,
        x: Math.random() * 96,
        d: 1.6 + Math.random() * 1,
        delay: Math.random() * 0.4,
        size: (18 + Math.random() * 16) * set.scale,
        sway: Math.random() * 60 - 30,
      }))
      setParts((p) => [...p, ...next])
      setBanner({ id, text: set.banner })
      window.setTimeout(() => setParts((p) => p.filter((x) => !next.includes(x))), 3000)
      window.setTimeout(() => setBanner((b) => (b?.id === id ? null : b)), 2000)
    }
    window.addEventListener('ledger-burst', onBurst)
    return () => window.removeEventListener('ledger-burst', onBurst)
  }, [])

  if (!parts.length && !banner) return null
  return (
    <>
      <div className="burst-layer" aria-hidden>
        {parts.map((p) => (
          <span
            key={p.id}
            className={`burst-p ${p.cls}`}
            style={{
              ['--x' as string]: `${p.x}%`,
              ['--d' as string]: `${p.d}s`,
              ['--delay' as string]: `${p.delay}s`,
              ['--sway' as string]: `${p.sway}px`,
              ['--s' as string]: `${p.size}px`,
            }}
          >
            <BurstItem name={p.emoji} size={p.size} />
          </span>
        ))}
      </div>
      {banner && <div key={banner.id} className="burst-banner" role="status">{banner.text}</div>}
    </>
  )
}
