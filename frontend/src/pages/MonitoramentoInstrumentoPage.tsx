/**
 * Pagina propria pro monitoramento interno pos-repasse -- achado 2026-09-09:
 * antes vivia embutido dentro do card de cada convenio na pagina principal
 * (ConvenioCard.tsx), como accordion. Movido pra ca a pedido do usuario --
 * o card so mostra um link agora quando ha instrumento monitorado (ver
 * `monitorado` em ConvenioCard.tsx). Mesmo estilo de cabecalho/breadcrumb
 * da pagina principal (MonitoramentoEquipamentosPage.tsx), pra manter a
 * mesma linguagem visual (prototipo de referencia desta sessao).
 *
 * Continua POC de 1 instrumento so (convenio 948686, decisao do usuario
 * 2026-09-03, reafirmada 2026-09-09: sem endpoint de criacao, sem escala
 * pros outros 402 convenios ainda) -- so mudou de lugar/ganhou cadastro
 * editavel (equipamento/tecnico/nivel/finalidade/modalidade) e Licenca
 * CNEN com numero de documento + validade (ver MonitoramentoInterno.tsx).
 */
import { Link, useParams } from 'react-router-dom';
import { colors, layout } from '../styles/tokens';
import { MonitoramentoInterno } from './monitoramento/MonitoramentoInterno';

export function MonitoramentoInstrumentoPage() {
  const { nrConvenio } = useParams<{ nrConvenio: string }>();

  if (!nrConvenio) {
    return <p style={{ padding: layout.pagePadding, color: colors.hipoRed }}>Número de convênio não informado.</p>;
  }

  return (
    <div style={{ minHeight: '100vh', background: colors.surface, padding: layout.pagePadding }}>
      <div style={{ maxWidth: layout.maxWidth, margin: '0 auto' }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: colors.subtleText, marginBottom: 6 }}>
          Ministério da Saúde <span style={{ margin: '0 4px' }}>›</span> DECAN / FNS <span style={{ margin: '0 4px' }}>›</span>{' '}
          <Link to="/monitoramento-equipamentos" style={{ color: colors.subtleText, textDecoration: 'none' }}>Monitoramento de Instrumentos</Link>{' '}
          <span style={{ margin: '0 4px' }}>›</span> <span style={{ color: colors.primary }}>Convênio {nrConvenio}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.01em', margin: '0 0 6px', color: colors.primary }}>
            Monitoramento interno — Convênio {nrConvenio}
          </h1>
          <Link
            to="/monitoramento-equipamentos"
            style={{ fontSize: 12.5, fontWeight: 600, color: colors.primary, textDecoration: 'none', whiteSpace: 'nowrap' }}
          >
            ← Voltar pra lista de convênios
          </Link>
        </div>
        <p style={{ color: colors.mutedText, fontSize: 13, maxWidth: 900, lineHeight: 1.6, marginBottom: 20 }}>
          Acompanhamento manual pós-repasse — entrega, instalação, licenciamento e inauguração do equipamento. Cobre
          o que nenhum sistema federal (TransfereGov, Portal da Transparência, SICONV) rastreia. Dado financeiro e de
          identificação (objeto, programa, situação contratual) continua na lista principal — aqui é só o que a
          equipe registra à mão.
        </p>

        <MonitoramentoInterno numeroConvenio={nrConvenio} />
      </div>
    </div>
  );
}
