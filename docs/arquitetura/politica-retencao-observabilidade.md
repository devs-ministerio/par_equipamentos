# Política de Retenção de Observabilidade — SIGEO

**Vigência:** 23/09/2026  
**Responsável operacional:** equipe técnica do SIGEO  
**Revisão:** trimestralmente e antes de qualquer mudança de plano, coletor ou
fonte de telemetria.

## Finalidade e escopo

Esta política aplica-se aos dados de observabilidade enviados para a conta
New Relic do SIGEO e aos artefatos operacionais diretamente associados. Seu
objetivo é permitir diagnóstico de indisponibilidade e desempenho pelo menor
tempo necessário, sem transformar telemetria em base de dados de usuários ou
arquivo de auditoria de negócio.

Ela não altera a retenção do banco Neon, das fontes de ingestão nem do
`AuditLog` relacional. Esses conjuntos seguem suas políticas específicas de
backup, segurança e ingestão.

## Classificação e prazo vigente

| Conjunto | Uso permitido | Retenção efetiva | Regra operacional |
|---|---|---:|---|
| Logs HTTP e de chamadas externas (`Log`) | Diagnóstico de incidentes e falhas de integração | 30 dias corridos, janela deslizante | Sem live archive, exportação recorrente ou partição de longa duração. |
| APM, erros e traces distribuídos | Latência, taxa de erro e investigação técnica pontual | 8 dias corridos | Não usar como evidência de auditoria ou histórico de negócio. |
| Resultados do Ping externo (`SyntheticCheck`) | Disponibilidade e SLA do endpoint público `/health` | 395 dias corridos | A consulta só verifica URL pública, TLS e disponibilidade; não incluir parâmetros, identidade ou payload. |
| Marcadores de mudança, se emitidos | Correlacionar deploy e incidente | 395 dias corridos | Somente SHA, ambiente, horário e resultado; nunca autor, segredo ou dado de usuário. |
| Artefatos de CI/SBOM | Rastreabilidade de build e vulnerabilidade | 30 dias corridos | Prazo definido nos workflows; não usar para backup de dados produtivos. |

Os prazos de `Log`, APM/traces e `Marker` foram conferidos na tela **Data
Retention** da conta New Relic `8544864` em 23/09/2026. O prazo de Synthetic
é gerido pelo produto e documentado pelo provedor como 395 dias. A alteração
de retenção configurável pode levar até 24 horas para entrar em vigor; qualquer
divergência na tela do provedor prevalece até que este documento seja corrigido.

Referência do provedor: [Data retention do New Relic](https://docs.newrelic.com/docs/data-apis/manage-data/manage-data-retention/).

## Minimização, acesso e descarte

- Encaminhar somente eventos sanitizados da aplicação. É proibido registrar ou
  enviar corpo, querystring, cookie, cabeçalho de autenticação, senha, token,
  usuário identificado, IP ou payload de integração.
- O `uvicorn --no-access-log` é obrigatório no boot. A telemetria HTTP aceita
  apenas método, caminho sem querystring, status, duração e `trace_id`
  aleatório.
- O agente New Relic permanece sem atributos de contexto adicionais e com
  teto de 1.000 amostras por minuto. Não criar live archive, nova partição ou
  extensão de retenção sem revisão de custo, privacidade e aprovação técnica.
- Acesso é limitado a quem opera incidentes ou administra a conta. Evite
  download de logs; quando indispensável, extraia o menor recorte possível e
  descarte o arquivo local ao fim do incidente.
- Ao fim de cada janela, o provedor expira os dados automaticamente. Não há
  cópia secundária de logs do SIGEO para prolongar a retenção.

## Incidente de privacidade em telemetria

Se houver suspeita de envio de dado sensível:

1. Interrompa a fonte afetada (por exemplo, desabilite o encaminhamento de
   logs ou reverta o deploy) sem apagar dados operacionais não relacionados.
2. Registre data, fonte, tipo de dado, período potencialmente atingido e
   pessoas com acesso; não replique o valor sensível no registro do incidente.
3. Revogue/rotacione qualquer segredo possivelmente exposto e corrija a fonte
   com teste de regressão antes de reabilitar o envio.
4. Solicite ao suporte do New Relic a remoção excepcional se necessária. Dados
   já ingeridos não possuem exclusão seletiva pelo produto; a expiração normal
   continua sendo o prazo desta política.
5. Reavalie a política e atualize o diagnóstico/RUNBOOK com a decisão e a
   evidência não sensível da correção.

O procedimento de remoção excepcional segue a orientação do
[New Relic para dados já ingeridos](https://docs.newrelic.com/docs/accounts/original-accounts-billing/product-based-pricing/overview-data-retention-components/).

## Revisão e exceções

Revisar trimestralmente os prazos efetivos, volume ingerido, permissões,
partições, configuração do agente e necessidade real de cada fonte. Exceções
de prazo ou arquivamento exigem justificativa de negócio, classificação dos
dados, responsável, custo, data de expiração e aprovação explícita antes de
qualquer mudança no provedor.
