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
import { Card, CardContent } from '@/components/ui/card';
import { MonitoramentoInterno } from '@/components/features/monitoramento-interno';

export function MonitoramentoInstrumentoPage() {
  const { nrConvenio } = useParams<{ nrConvenio: string }>();

  if (!nrConvenio) {
    return <p className="text-destructive">Número de convênio não informado.</p>;
  }

  return (
    <div>
      <Card className="mb-4 py-0">
        <CardContent className="p-5.5">
        <div className="mb-2 text-[11px] font-extrabold tracking-[0.08em] text-muted-foreground uppercase">
          <Link to="/monitoramento-equipamentos/instrumentos" className="text-muted-foreground no-underline hover:text-primary">Monitoramento interno</Link>
          <span className="mx-1.5">›</span>
          <Link to="/monitoramento-equipamentos" className="text-muted-foreground no-underline hover:text-primary">Dados oficiais</Link>
          <span className="mx-1.5">›</span>
          <span className="text-primary">Convênio {nrConvenio}</span>
        </div>
        <h1 className="m-0 text-3xl font-extrabold tracking-[-0.03em] text-foreground">
          Convênio {nrConvenio}
        </h1>
        <p className="mt-2.5 max-w-[760px] text-[13.5px] leading-relaxed text-muted-foreground">
          Registre eventos e ações acompanhados pela equipe, complementando o que as APIs oficiais não detalham.
        </p>
        </CardContent>
      </Card>

      <MonitoramentoInterno numeroConvenio={nrConvenio} />
    </div>
  );
}
