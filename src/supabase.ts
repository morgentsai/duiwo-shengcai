import { createClient } from '@supabase/supabase-js'

// 公開金鑰（publishable key）可以放在前端；資料安全由資料庫的 RLS 規則保護。
// 服務金鑰（service role key）絕對不能放在這裡。
const SUPABASE_URL = 'https://dcjccysgehccmmpkjejn.supabase.co'
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_762btof-H_27AMvoEKvL6Q_IgTRHmXJ'

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
