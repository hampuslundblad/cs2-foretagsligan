import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
// `base` must match the GitHub Pages repo path: https://<user>.github.io/cs2-foretagsligan/
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? '/cs2-foretagsligan/' : '/',
}))
