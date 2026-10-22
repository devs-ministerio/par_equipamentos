import { test } from "vitest";
import assert from "node:assert/strict";
import { avaliarCobertura } from "./validar-cobertura.mjs";

function arquivo(contagens, branches = [1]) {
  return {
    statementMap: Object.fromEntries(
      contagens.map((_, i) => [i, { start: { line: i + 1 } }]),
    ),
    s: Object.fromEntries(contagens.map((contagem, i) => [i, contagem])),
    b: { 0: branches },
  };
}

test("não une a mesma linha de arquivos distintos para elevar cobertura", () => {
  const cobertura = {
    "/src/hooks/a.ts": arquivo([1]),
    "/src/hooks/b.ts": arquivo([0]),
  };
  const [hooks] = avaliarCobertura(cobertura);
  assert.equal(hooks.linhas, 50);
  assert.equal(hooks.aprovado, false);
});

test("branches abaixo do piso bloqueiam mesmo com todas as linhas cobertas", () => {
  const [hooks] = avaliarCobertura({ "/src/hooks/a.ts": arquivo([1], [1, 0]) });
  assert.equal(hooks.linhas, 100);
  assert.equal(hooks.branches, 50);
  assert.equal(hooks.aprovado, false);
});

test("camada ausente não é interpretada como cobertura completa", () => {
  assert.deepEqual(
    avaliarCobertura({}).map((r) => r.aprovado),
    [false, false],
  );
});

test("aceita exatamente o piso nas duas métricas e nas duas camadas", () => {
  const contagens = [1, 1, 1, 1, 1, 1, 1, 0, 0, 0];
  const resultados = avaliarCobertura({
    "/src/hooks/a.ts": arquivo(contagens, contagens),
    "/src/components/features/a.tsx": arquivo(contagens, contagens),
  });
  assert.deepEqual(
    resultados.map((r) => [r.linhas, r.branches, r.aprovado]),
    [
      [70, 70, true],
      [70, 70, true],
    ],
  );
});
