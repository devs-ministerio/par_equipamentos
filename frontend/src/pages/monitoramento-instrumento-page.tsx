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
import { PageHeader } from '@/components/common/page-header';
import { MonitoramentoInterno } from '@/components/features/monitoramento-interno';

export function MonitoramentoInstrumentoPage() {
  const { nrConvenio } = useParams<{ nrConvenio: string }>();

  if (!nrConvenio) {
    return <p className="text-destructive">Número de convênio não informado.</p>;
  }

  return (
    <div>
      <PageHeader
        breadcrumb={
          <>
            <Link to="/monitoramento-equipamentos/instrumentos" className="text-muted-foreground no-underline hover:text-primary">Monitoramento interno</Link>
            <span className="mx-1.5">›</span>
            <span className="text-primary">{nrConvenio}</span>
          </>
        }
        eyebrow="Monitoramento interno"
        title={nrConvenio}
        description="Eventos, prazos e pendências do instrumento."
      />

      <MonitoramentoInterno numeroConvenio={nrConvenio} />
    </div>
  );
}
