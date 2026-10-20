import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
const CAMADAS = [
  { nome: "hooks", marcador: "/src/hooks/", piso: 70 },
  {
    nome: "componentes de domínio",
    marcador: "/src/components/features/",
    piso: 70,
  },
];

function percentuais(arquivos) {
  let totalLinhas = 0;
  let linhasCobertas = 0;
  let totalBranches = 0;
  let branchesCobertas = 0;
  for (const arquivo of arquivos) {
    // Números de linha só têm identidade dentro do próprio arquivo.
    const linhas = new Map();
    for (const [id, local] of Object.entries(arquivo.statementMap)) {
      const linha = local.start.line;
      linhas.set(linha, (linhas.get(linha) ?? 0) || arquivo.s[id] > 0);
    }
    totalLinhas += linhas.size;
    linhasCobertas += [...linhas.values()].filter(Boolean).length;
    for (const contagens of Object.values(arquivo.b)) {
      totalBranches += contagens.length;
      branchesCobertas += contagens.filter((valor) => valor > 0).length;
    }
  }
  return {
    linhas: totalLinhas === 0 ? 0 : (linhasCobertas / totalLinhas) * 100,
    branches:
      totalBranches === 0 ? 100 : (branchesCobertas / totalBranches) * 100,
  };
}

export function avaliarCobertura(cobertura) {
  return CAMADAS.map((camada) => {
    const arquivos = Object.entries(cobertura)
      .filter(([caminho]) =>
        caminho.replaceAll("\\", "/").includes(camada.marcador),
      )
      .map(([, dados]) => dados);
    const resultado = percentuais(arquivos);
    return {
      ...camada,
      ...resultado,
      aprovado:
        arquivos.length > 0 &&
        resultado.linhas >= camada.piso &&
        resultado.branches >= camada.piso,
    };
  });
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const arquivo = process.argv[2];
  if (!arquivo) {
    console.error(
      "Uso: node scripts/validar-cobertura.mjs <coverage-final.json>",
    );
    process.exit(2);
  }
  const resultados = avaliarCobertura(
    JSON.parse(readFileSync(arquivo, "utf8")),
  );
  for (const resultado of resultados) {
    console.log(
      `${resultado.nome}: linhas=${resultado.linhas.toFixed(1)}% branches=${resultado.branches.toFixed(1)}% piso=${resultado.piso}%`,
    );
  }
  const violacoes = resultados.filter((resultado) => !resultado.aprovado);
  if (violacoes.length) {
    console.error(
      `Cobertura abaixo do piso ou ausente: ${violacoes.map((r) => r.nome).join(", ")}.`,
    );
    process.exit(1);
  }
}
