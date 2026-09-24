import { readFileSync } from 'node:fs';

const arquivo = process.argv[2];
if (!arquivo) {
  console.error('Uso: node scripts/validar-cobertura.mjs <coverage-final.json>');
  process.exit(2);
}

const cobertura = JSON.parse(readFileSync(arquivo, 'utf8'));
const CAMADAS = [
  { nome: 'hooks', marcador: '/src/hooks/', piso: 70 },
  { nome: 'componentes de domínio', marcador: '/src/components/features/', piso: 70 },
];

function percentualDeLinhas(arquivos) {
  const linhas = new Map();
  for (const arquivo of arquivos) {
    for (const [id, local] of Object.entries(arquivo.statementMap)) {
      const linha = local.start.line;
      linhas.set(linha, (linhas.get(linha) ?? 0) || arquivo.s[id] > 0);
    }
  }
  const cobertas = [...linhas.values()].filter(Boolean).length;
  return { cobertas, total: linhas.size, percentual: linhas.size === 0 ? 100 : (cobertas / linhas.size) * 100 };
}

const violacoes = [];
for (const camada of CAMADAS) {
  const arquivos = Object.entries(cobertura)
    .filter(([caminho]) => caminho.replaceAll('\\', '/').includes(camada.marcador))
    .map(([, dados]) => dados);
  const resultado = percentualDeLinhas(arquivos);
  console.log(`${camada.nome}: ${resultado.percentual.toFixed(1)}% (${resultado.cobertas}/${resultado.total} linhas; piso ${camada.piso}%)`);
  if (resultado.percentual < camada.piso) violacoes.push(camada.nome);
}

if (violacoes.length) {
  console.error(`Cobertura abaixo do piso: ${violacoes.join(', ')}.`);
  process.exit(1);
}
