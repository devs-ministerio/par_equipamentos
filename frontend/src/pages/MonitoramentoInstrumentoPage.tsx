/**
 * Pagina propria pro monitoramento interno pos-repasse -- achado 2026-09-09:
 * antes vivia embutido dentro do card de cada convenio na pagina principal
 * (ConvenioCard.tsx), como accordion. Movido pra ca a pedido do usuario --
 * o card so mostra um link agora quando ha instrumento monitorado (ver
 * `monitorado` em ConvenioCard.tsx).
 *
 * Escalado de 1 pra 86 instrumentos (ver
 * backend/scripts/importar_planilha_monitoramento.py). Vive dentro de
 * `MonitoramentoLayout` (achado 2026-09-10, pedido do usuario: "implante
 * os menus de navegação") -- Header/nav ja cobertos la, aqui so o
 * conteudo especifico da pagina.
 */
import { Link, useParams } from 'react-router-dom';
import { colors } from '../styles/tokens';
import { MonitoramentoInterno } from './monitoramento/MonitoramentoInterno';

export function MonitoramentoInstrumentoPage() {
  const { nrConvenio } = useParams<{ nrConvenio: string }>();

  if (!nrConvenio) {
    return <p style={{ color: colors.hipoRed }}>Número de convênio não informado.</p>;
  }

  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: colors.subtleText, marginBottom: 6 }}>
        <Link to="/monitoramento-equipamentos/instrumentos" style={{ color: colors.subtleText, textDecoration: 'none' }}>Visão Geral</Link>{' '}
        <span style={{ margin: '0 4px' }}>›</span> <span style={{ color: colors.primary }}>Convênio {nrConvenio}</span>
      </div>
      <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.01em', margin: '0 0 6px', color: colors.primary }}>
        Monitoramento interno — Convênio {nrConvenio}
      </h1>
      <p style={{ color: colors.mutedText, fontSize: 13, maxWidth: 900, lineHeight: 1.6, marginBottom: 20 }}>
        Acompanhamento manual pós-repasse — entrega, instalação, licenciamento e inauguração do equipamento. Cobre
        o que nenhum sistema federal (TransfereGov, Portal da Transparência, SICONV) rastreia. Dado financeiro e de
        identificação (objeto, programa, situação contratual) continua na lista principal — aqui é só o que a
        equipe registra à mão.
      </p>

      <MonitoramentoInterno numeroConvenio={nrConvenio} />
    </div>
  );
}
