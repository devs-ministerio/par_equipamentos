/** Cabeçalho de MonitoramentoInterno -- card de identificação/valor global +
 * grid de indicadores rápidos. Extraído do arquivo original (Seção 6 da
 * migração). */
import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { InstrumentoTimeline } from '@/services/monitoramento-instrumentos';
import { fmtData, fmtMoeda } from '@/lib/monitoramento-format';
import { CnesPicker } from '@/components/common/cnes-picker';
import { TIPOLOGIA_PERSUS } from '@/data/constants';
import { estiloCard, StatusPill } from './monitoramento-ui';

export function MonitoramentoInternoCabecalho({
  timeline,
  componenteViaSiconv,
  dataInauguracao,
  inaugurado,
  diasInauguracao,
  equipamentoFisico,
  statusLicenca,
  textoLicenca,
  alertaLicenca,
  acoesAbertasCount,
  acoesAtrasadasCount,
  podeEditar,
  onSalvarCnes,
}: {
  timeline: InstrumentoTimeline;
  componenteViaSiconv: string | null;
  dataInauguracao: string | null;
  inaugurado: boolean;
  diasInauguracao: number | null;
  equipamentoFisico: string | null;
  statusLicenca: string;
  textoLicenca: string;
  alertaLicenca: boolean;
  acoesAbertasCount: number;
  acoesAtrasadasCount: number;
  /** CNES editável -- mesmo gate de permissão do resto do cadastro;
   * validação de verdade (CNES existe na base?) é sempre no backend. */
  podeEditar: boolean;
  onSalvarCnes: (cnes: string | null) => void;
}) {
  const inst = timeline.instrumento;
  const aoVivo = timeline.ao_vivo;
  const [editandoCnes, setEditandoCnes] = useState(false);
  const equipamentoReferencia = inst.equipamento_descricao ?? 'Não informado';
  const programaFonte = [inst.tp_instrumento_programa, inst.tipologia && `Tipologia: ${TIPOLOGIA_PERSUS[inst.tipologia] ?? inst.tipologia}`]
    .filter(Boolean)
    .join(' · ');
  const origemAlternativa = Boolean(inst.origem_dado);
  const prestacaoConcluida = inst.situacao_prestacao_contas?.toLocaleLowerCase('pt-BR').includes('concluída') ?? false;
  const divergenciaInauguracao = inaugurado && inst.tipo_contratacao === 'Convênio' && !prestacaoConcluida;

  const indicadores = [
    {
      rotulo: 'Equipamento físico',
      valor: equipamentoFisico ?? equipamentoReferencia,
      detalhe: inst.equipamento_numero_serie
        ? `Série ${inst.equipamento_numero_serie}`
        : equipamentoFisico ? 'Registro feito no evento de entrega' : 'Referência planejada; físico ainda não confirmado',
    },
    { rotulo: 'Licença CNEN', valor: !statusLicenca || statusLicenca === 'Sem registro' ? (origemAlternativa ? 'Não informada na fonte' : 'Sem registro') : statusLicenca, detalhe: textoLicenca === 'Sem validade registrada' && origemAlternativa ? 'A fonte de ingestão não informou licença CNEN' : textoLicenca, alerta: alertaLicenca },
    { rotulo: 'Inauguração', valor: inaugurado ? 'Realizada' : dataInauguracao ? 'Prevista' : (origemAlternativa ? 'Não informada na fonte' : 'Sem previsão'), detalhe: dataInauguracao ? fmtData(dataInauguracao) : (origemAlternativa ? 'A fonte de ingestão não informou data ou previsão' : 'Sem marco registrado'), alerta: diasInauguracao !== null && diasInauguracao < 0 },
    { rotulo: 'Ações abertas', valor: acoesAbertasCount, detalhe: `${acoesAtrasadasCount} atrasada(s)`, alerta: acoesAtrasadasCount > 0 },
    // Situação da prestação de contas no SICONV legado -- sincronizada por
    // job_verificacao_siconv.py, só existe pra tipo_contratacao="Convênio"
    // (FAF/TED nunca estiveram no SICONV).
    ...(inst.tipo_contratacao === 'Convênio'
      ? [{
          rotulo: 'Prestação de contas (SICONV)',
          valor: inst.situacao_prestacao_contas ?? 'Sem dado',
          detalhe: divergenciaInauguracao
            ? 'Alerta: equipamento inaugurado, mas a situação externa ainda não foi concluída'
            : prestacaoConcluida ? 'Concluída' : 'Ainda não concluída',
          alerta: divergenciaInauguracao,
        }]
      : []),
    ...(inst.situacao_programa
      ? [{ rotulo: 'Situação do programa', valor: inst.situacao_programa, detalhe: inst.origem_dado ?? 'Fonte de ingestão', alerta: false }]
      : []),
    // Situação no TransfereGov Novo -- sincronizada por
    // job_verificacao_transferegov.py, só existe pra
    // tipo_contratacao="Parceria TransfereGov". Sem estado "Concluída"
    // nesta API (testado ao vivo) -- por isso mostra a ordem de
    // pagamento (sinal real de dinheiro executado) como detalhe, não
    // como "concluído"/"pendente" binário.
    ...(inst.tipo_contratacao === 'Parceria TransfereGov'
      ? [{
          rotulo: 'Situação (TransfereGov)',
          valor: inst.situacao_parceria_transferegov ?? 'Sem dado',
          detalhe: inst.situacao_ordem_pagamento_transferegov
            ? `Ordem de pagamento: ${inst.situacao_ordem_pagamento_transferegov}`
            : 'Sem ordem de pagamento emitida ainda',
          alerta: false,
        }]
      : []),
  ];

  return (
    <>
      <div className={cn(estiloCard, 'mb-4')}>
        <div className="flex justify-between flex-wrap gap-3">
          <div>
            <div className="font-bold text-[15px] flex items-center gap-2">
              Convênio {inst.nr_convenio} — {inst.nome_convenente}
              {/* Chip de tipo_contratacao -- os 28 registros FAF/TED (sem
                  numero TransfereGov, usam o NUP SEI como identificador
                  aqui) agora convivem com os Convênio de verdade. */}
              {inst.tipo_contratacao && inst.tipo_contratacao !== 'Convênio' && (
                <span className="text-[10.5px] font-bold py-0.5 px-2 rounded-full bg-warning-bg text-warning">
                  {inst.tipo_contratacao}
                </span>
              )}
            </div>
            <div className="relative text-xs text-muted-foreground">
              {inst.municipio}/{inst.uf} · CNES {inst.cnes ?? '—'}
              {podeEditar && (
                <button
                  type="button"
                  onClick={() => setEditandoCnes((v) => !v)}
                  className="ml-1 text-[10.5px] font-semibold text-primary hover:underline"
                >
                  editar
                </button>
              )}
              {editandoCnes && (
                <CnesPicker
                  valorAtual={inst.cnes}
                  onEscolher={(cnes) => {
                    onSalvarCnes(cnes);
                    setEditandoCnes(false);
                  }}
                  onCancelar={() => setEditandoCnes(false)}
                />
              )}
              {' · '}
              <span title="Equipamento planejado (SICONV/plano de aplicação) — não editável aqui">{inst.equipamento_descricao}</span>
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Programa: {inst.programa ?? '—'}{programaFonte ? ` (${programaFonte})` : ''} · Componente:{' '}
              {inst.componente ? (
                <strong>{inst.componente}</strong>
              ) : componenteViaSiconv ? (
                <span title="Não preenchido na planilha da equipe — derivado do programa SICONV pra esse convênio">
                  <strong>{componenteViaSiconv}</strong> <em className="not-italic text-muted-foreground/70">(via SICONV)</em>
                </span>
              ) : (
                <strong>—</strong>
              )}
            </div>
            {(inst.responsavel_execucao_nome || inst.responsavel_execucao_contato) && (
              <div className="text-xs text-muted-foreground mt-1">
                Responsável técnico da execução (instituição): <strong>{inst.responsavel_execucao_nome ?? '—'}</strong>
                {inst.responsavel_execucao_contato && <> · {inst.responsavel_execucao_contato}</>}
              </div>
            )}
          </div>
          <div className="text-right">
            <div className="text-[10.5px] text-muted-foreground uppercase">
              Valor global {aoVivo.disponivel && '(ao vivo)'}
            </div>
            {aoVivo.disponivel ? (
              <>
                <div className="text-base font-semibold">{fmtMoeda(aoVivo.valor)}</div>
                <div className="text-[11px] text-muted-foreground">Liberado: {fmtMoeda(aoVivo.valor_liberado)}</div>
                {aoVivo.situacao && <div className="mt-1"><StatusPill texto={aoVivo.situacao} /></div>}
                {aoVivo.valor_suspeito && (
                  <div className="text-[10.5px] text-warning mt-1 max-w-[200px] text-right">
                    Atenção: valor global menor que o liberado — possível truncamento no Portal da Transparência; confira manualmente.
                  </div>
                )}
              </>
            ) : (
              <div className="text-xs font-semibold text-warning">Indisponível no Portal da Transparência</div>
            )}
          </div>
        </div>

        {/* Previsao de inauguracao em destaque -- so aparece quando ha
            data (evento lançado pro marco). */}
        {dataInauguracao && (
          <div className="mt-3 pt-2.5 border-t border-border flex justify-between items-center flex-wrap gap-2">
            <span className="text-[12.5px] font-semibold">
              {inaugurado ? 'Inaugurado em' : 'Previsão de inauguração:'} {fmtData(dataInauguracao)}
            </span>
            {!inaugurado && diasInauguracao !== null && (
              <span className={cn('text-[11.5px] font-bold', diasInauguracao < 0 ? 'text-warning' : 'text-primary')}>
                {diasInauguracao < 0 ? `Atrasada há ${Math.abs(diasInauguracao)} dia(s)` : `Faltam ${diasInauguracao} dia(s)`}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(min(190px,100%),1fr))] gap-3">
        {indicadores.map((item) => (
          <div
            key={item.rotulo}
            className={cn('rounded-xl border bg-card p-3.5 shadow-xs', item.alerta ? 'border-warning' : 'border-border')}
          >
            <div className="mb-1.5 text-[10.5px] font-extrabold tracking-[0.05em] text-muted-foreground uppercase">{item.rotulo}</div>
            <strong className="block text-[15px] leading-tight text-foreground">{item.valor}</strong>
            <div className={cn('mt-1 text-[11.5px] leading-snug', item.alerta ? 'text-warning' : 'text-muted-foreground')}>{item.detalhe}</div>
          </div>
        ))}
      </div>
    </>
  );
}
