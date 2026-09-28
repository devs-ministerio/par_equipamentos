# Diagnóstico da Constituição DevOps — 2026-09-28

## Escopo e método

Revisão de Dockerfile, Render/Vercel, GitHub Actions, migração, supply chain,
backup/rollback e observabilidade declarados no repositório. Serviços externos
não foram considerados comprovados sem evidência operacional.

## Evidências

- Há CI separado para backend, frontend, E2E, segredo, Semgrep, SBOM/CVE e
  lint de workflow; actions e imagens de análise estão pinadas por SHA.
- O Dockerfile usa multi-stage, usuário não-root e healthcheck; Render não
  executa Alembic no boot e migrations têm workflow manual com role separado.
- Pipelines e radar são manuais e serializados no grupo de concorrência do
  banco; `render.yaml` usa auto deploy condicionado a checks.
- A auditoria Database demonstrou que o Neon ainda está atrás do head local.

## Avaliação

**Conformidade: 8,0/10.** O desenho versionado é robusto, mas a migração
pendente e a ausência de prova publicada impedem classificá-lo como fechado.

### P1 — drift de migration bloqueia confiança no deploy

Executar primeiro o workflow de migration com PITR/rollback definidos e só
depois deploy ou job que dependa de colunas novas. Registrar revisão atual,
smoke `/health` e versão pós-upgrade.

### P1 — controles externos e rollback não foram revalidados

Branch protection, status checks obrigatórios, backup restaurável, headers no
domínio e rollback da imagem não são verificáveis só pelo repositório. Coletar
evidência operacional datada antes de reduzir essas pendências.

### P2 — build não é completamente reproduzível no nível do SO

Embora a imagem Python esteja pinada, `apt-get upgrade` resolve pacotes no
momento do build. Avaliar imagem base digerida ou remoção do upgrade quando a
próxima mudança de container tiver plan-mode aprovado.

## Próximo Plan Mode

Priorizar janela de migration e checklist pós-deploy; depois registrar
evidência de rollback e de serviços externos sem armazenar credenciais.
