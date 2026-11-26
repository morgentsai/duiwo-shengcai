import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // 相對路徑，讓網站可放在 GitHub Pages 的子網址（/duiwo-shengcai/）下正常載入
  base: './',
})
