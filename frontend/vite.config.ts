/// <reference types="vitest/config" />
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  build: {
    // Orçamento de bundle (Etapa 11 do plan-mode frontend, 2026-09-17) --
    // maior que o default (500kB) de propósito: os 2 chunks que passam do
    // default (jspdf ~400kB, exceljs ~930kB, ver relatorios-page.tsx) são
    // `lazy()` desde o Bloco 6, só entram no download quando o usuário abre
    // o popup de exportação -- nunca no carregamento inicial. 1MB continua
    // baixo o bastante pra pegar uma regressão real no bundle EAGER (hoje
    // ~380kB, o maior chunk carregado sempre).
    chunkSizeWarningLimit: 1000,
  },
  test: {
    // jsdom (Etapa 10 do plan-mode frontend, 2026-09-17) -- testes de
    // lógica pura continuam rodando igual (jsdom não muda o resultado
    // deles), mas agora dá pra montar componente de verdade com
    // @testing-library/react.
    environment: 'jsdom',
    // `globals: true` -- `@testing-library/react` só faz cleanup automático
    // entre testes (unmount, sem o que os testes de componente vazam DOM de
    // um teste pro outro) quando encontra `afterEach` global.
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    // `e2e/*.spec.ts` é do Playwright (outro test runner, outro processo) --
    // sem isso o glob default do vitest tentaria rodar esses specs também.
    exclude: ['node_modules/**', 'e2e/**'],
  },
})
