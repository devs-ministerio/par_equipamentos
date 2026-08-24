import { describe, expect, it } from 'vitest';
import { distanciaKm } from './geo';

// Mesmos casos de backend/tests/test_geo.py -- confere que a
// reimplementação em JS bate com a do Python (mesma formula/precisão).
describe('distanciaKm', () => {
  it('São Paulo -> Rio de Janeiro: ~357-361km (varia com o ponto exato)', () => {
    const d = distanciaKm(-23.5505, -46.6333, -22.9068, -43.1729);
    expect(d).toBeGreaterThan(350);
    expect(d).toBeLessThan(370);
  });

  it('mesmo ponto = 0', () => {
    expect(distanciaKm(-23.5505, -46.6333, -23.5505, -46.6333)).toBe(0);
  });

  it('São Paulo -> Brasília: ~870km', () => {
    const d = distanciaKm(-23.5505, -46.6333, -15.7939, -47.8828);
    expect(d).toBeGreaterThan(850);
    expect(d).toBeLessThan(890);
  });
});
