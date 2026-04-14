import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    target: ['es2015', 'safari13'],
  },
  optimizeDeps: {
    include: ['pdfjs-dist/legacy/build/pdf'],
    exclude: ['pdfjs-dist/legacy/build/pdf.worker.min.mjs'],
  },
})
