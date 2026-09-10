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
  test: {
    // node (sem jsdom) -- os testes de hoje cobrem so logica pura
    // (utils/coeficiente, format, texto, data/constants), sem montar
    // componente React. Adicionar jsdom + @testing-library/react so quando
    // um teste realmente precisar renderizar algo.
    environment: 'node',
  },
})
