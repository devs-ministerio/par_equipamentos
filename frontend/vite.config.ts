/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    // node (sem jsdom) -- os testes de hoje cobrem so logica pura
    // (utils/coeficiente, format, texto, data/constants), sem montar
    // componente React. Adicionar jsdom + @testing-library/react so quando
    // um teste realmente precisar renderizar algo.
    environment: 'node',
  },
})
