/** Form "Lançar evento" -- React Hook Form + zod, campos condicionais por
 * grupo/código do marco selecionado (regulatório pede status/documento/
 * validade; marco de entrega pede o equipamento físico). Extraído de
 * MonitoramentoInterno.tsx. */
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { cn } from '@/lib/utils';
import type { MarcoCatalogo } from '@/services/monitoramento-marcos';
import { enviarEventoSchema, type EnviarEventoFormValues } from '@/lib/validations/monitoramento';
import { ErroCampo, estiloCard, estiloInput } from './monitoramento-ui';
import { idsDescricaoCampo } from '@/lib/monitoramento-status';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const STATUS_REGULATORIO_OPCOES = ['NI', 'NA', 'Em análise', 'Em diligência', 'Deferido', 'Indeferido'];

const GRUPOS: { chave: MarcoCatalogo['grupo']; rotulo: string }[] = [
  { chave: 'fase_geral', rotulo: 'Fase geral' },
  { chave: 'cronograma_fisico', rotulo: 'Cronograma físico' },
  { chave: 'regulatorio', rotulo: 'Regulatório (CNEN)' },
];

export function MonitoramentoInternoFormEvento({
  marcos,
  onRegistrar,
  valoresIniciais,
  marcoFixo,
  rotuloSubmit = 'Registrar evento',
  previsaoInauguracao,
}: {
  marcos: MarcoCatalogo[];
  onRegistrar: (valores: EnviarEventoFormValues) => Promise<void>;
  /** Pré-preenche o form pra correção (Plan Mode monitoramento-evolucao
   * 2026-09-19) -- "editar" é sempre uma correção append-only, nunca um
   * UPDATE do lançamento original. */
  valoresIniciais?: Partial<EnviarEventoFormValues>;
  /** Em modo correção o marco/instrumento do evento original nunca mudam
   * (ver docstring do backend) -- mostra o marco como texto fixo em vez de
   * select editável. */
  marcoFixo?: MarcoCatalogo;
  rotuloSubmit?: string;
  previsaoInauguracao?: string | null;
}) {
  const {
    register,
    handleSubmit,
    watch,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<EnviarEventoFormValues>({
    resolver: zodResolver(enviarEventoSchema),
    defaultValues: valoresIniciais ?? (marcoFixo ? { marcoId: String(marcoFixo.id) } : undefined),
  });
  const [conclusaoPendente, setConclusaoPendente] = useState<EnviarEventoFormValues | null>(null);

  const marcoIdSelecionado = watch('marcoId');
  const marcoDoForm = marcoFixo ?? marcos.find((m) => String(m.id) === marcoIdSelecionado);
  const ehRegulatorio = marcoDoForm?.grupo === 'regulatorio';
  const ehLicencaOperacao = marcoDoForm?.codigo === 'regulatorio_licenca_operacao';
  // Marco de cronograma físico/regulatório precisa indicar a fase geral
  // correspondente (Plan Mode monitoramento-evolucao 2026-09-19 -- fecha o
  // bug de evento registrado sem mover a fase geral). Obrigatório aqui e
  // validado de novo no backend.
  const precisaFaseGeral = Boolean(marcoDoForm) && marcoDoForm?.grupo !== 'fase_geral';
  const fasesGerais = marcos.filter((m) => m.grupo === 'fase_geral');
  // Achado 2026-09-09, 2a rodada (pedido do usuario: "o equipamento
  // entregue pode mover para eventos") -- so o marco de entrega pede os
  // campos fisicos, junto do mesmo lancamento.
  const ehEntrega = marcoDoForm?.codigo === 'cronograma_entrega';
  const ehConclusao = marcoDoForm?.codigo === 'fase_concluido';

  useEffect(() => {
    if (marcoDoForm?.grupo === 'fase_geral') setValue('dataPrevista', '');
  }, [marcoDoForm?.grupo, setValue]);

  async function aoSubmeter(valores: EnviarEventoFormValues) {
    if (precisaFaseGeral && !valores.faseGeralId) {
      setError('faseGeralId', { message: 'Selecione a fase geral correspondente.' });
      return;
    }
    if (ehConclusao && !marcoFixo) {
      if (!valores.dataOcorrencia) {
        setError('dataOcorrencia', { message: 'Informe a data de conclusão.' });
        return;
      }
      setConclusaoPendente(valores);
      return;
    }
    try {
      await onRegistrar(valores);
    } catch {
      // Erro de escrita vira o banner global da página.
    }
  }

  return (
    <>
      <form onSubmit={handleSubmit(aoSubmeter)} className={cn(estiloCard, 'mb-4 grid gap-2.5')}>
      <div className="flex gap-2.5 flex-wrap items-start">
        <div className="flex-1 min-w-60">
          <label htmlFor="evento-marco" className="text-[11px] text-muted-foreground block mb-1">
            Marco
          </label>
          {marcoFixo ? (
            // Corrigir não muda o marco/instrumento do lançamento original
            // (ver docstring do backend) -- mostra fixo em vez de editável.
            <div className={cn(estiloInput, 'w-full bg-background text-muted-foreground')}>{marcoFixo.rotulo}</div>
          ) : (
            <select
              id="evento-marco"
              className={cn(estiloInput, 'w-full')}
              aria-invalid={Boolean(errors.marcoId)}
              aria-describedby={idsDescricaoCampo('evento-marco', Boolean(errors.marcoId), false)}
              defaultValue=""
              {...register('marcoId')}
            >
              <option value="" disabled>Selecione o marco...</option>
              {GRUPOS.map(({ chave, rotulo }) => (
                <optgroup key={chave} label={rotulo}>
                  {marcos.filter((m) => m.grupo === chave).map((m) => (
                    <option key={m.id} value={m.id}>{m.rotulo}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          )}
          <ErroCampo id="evento-marco-error" mensagem={errors.marcoId?.message} />
        </div>
        {precisaFaseGeral && (
          <div className="flex-1 min-w-52">
            <label htmlFor="evento-fase-geral" className="text-[11px] text-muted-foreground block mb-1">
              Fase geral correspondente
            </label>
            <select
              id="evento-fase-geral"
              className={cn(estiloInput, 'w-full')}
              aria-invalid={Boolean(errors.faseGeralId)}
              aria-describedby={idsDescricaoCampo('evento-fase-geral', Boolean(errors.faseGeralId), false)}
              defaultValue=""
              {...register('faseGeralId')}
            >
              <option value="" disabled>Selecione a fase...</option>
              {fasesGerais.map((f) => (
                <option key={f.id} value={f.id}>{f.rotulo}</option>
              ))}
            </select>
            <ErroCampo id="evento-fase-geral-error" mensagem={errors.faseGeralId?.message} />
          </div>
        )}
        <div>
          {/* Rotulo dinamico -- pedido do usuario 2026-09-09: "a licenca
              cnen vamos precisar da data da licença e da data de validade
              da licença", nao so um icone de calendario com tooltip. */}
          <label htmlFor="evento-data-ocorrencia" className="text-[11px] text-muted-foreground block mb-1">
            {ehLicencaOperacao ? 'Data da licença' : ehRegulatorio ? 'Data do documento' : 'Data de ocorrência'}
          </label>
          <input id="evento-data-ocorrencia" type="date" className={estiloInput} {...register('dataOcorrencia')} />
        </div>
        {marcoDoForm?.grupo !== 'fase_geral' && <div>
          <label htmlFor="evento-data-prevista" className="text-[11px] text-muted-foreground block mb-1">
            Data prevista
          </label>
          <input id="evento-data-prevista" type="date" className={estiloInput} {...register('dataPrevista')} />
        </div>}
      </div>

      {ehRegulatorio && (
        <div className="flex gap-2.5 flex-wrap items-start">
          <div className="flex-1 min-w-40">
            <label htmlFor="evento-status-regulatorio" className="text-[11px] text-muted-foreground block mb-1">
              Status regulatório
            </label>
            <select id="evento-status-regulatorio" className={cn(estiloInput, 'w-full')} defaultValue="" {...register('statusRegulatorio')}>
              <option value="">Status regulatório...</option>
              {STATUS_REGULATORIO_OPCOES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-40">
            <label htmlFor="evento-numero-documento" className="text-[11px] text-muted-foreground block mb-1">
              Nº matrícula/licença/processo
            </label>
            <input id="evento-numero-documento" className={cn(estiloInput, 'w-full')} {...register('numeroDocumento')} />
          </div>
          <div>
            <label htmlFor="evento-data-validade" className="text-[11px] text-muted-foreground block mb-1">
              Data de validade
            </label>
            <input id="evento-data-validade" type="date" className={estiloInput} {...register('dataValidade')} />
          </div>
        </div>
      )}

      {ehEntrega && (
        <div>
          <div className="text-[11.5px] font-bold text-primary mb-2">
            Equipamento entregue{' '}
            <span className="font-normal text-muted-foreground normal-case">(informado pelo estabelecimento, opcional)</span>
          </div>
          <div className="grid [grid-template-columns:repeat(auto-fit,minmax(160px,1fr))] gap-2.5">
            <div>
              <label htmlFor="evento-equip-marca" className="text-[11px] text-muted-foreground block mb-1">Marca</label>
              <input id="evento-equip-marca" className={cn(estiloInput, 'w-full')} {...register('equipamentoMarca')} />
            </div>
            <div>
              <label htmlFor="evento-equip-modelo" className="text-[11px] text-muted-foreground block mb-1">Modelo</label>
              <input id="evento-equip-modelo" className={cn(estiloInput, 'w-full')} {...register('equipamentoModelo')} />
            </div>
            <div>
              <label htmlFor="evento-equip-serie" className="text-[11px] text-muted-foreground block mb-1">Nº de série</label>
              <input id="evento-equip-serie" className={cn(estiloInput, 'w-full')} {...register('equipamentoNumeroSerie')} />
            </div>
            <div>
              <label htmlFor="evento-equip-vida-util" className="text-[11px] text-muted-foreground block mb-1">Vida útil (anos)</label>
              <input id="evento-equip-vida-util" type="number" min={0} className={cn(estiloInput, 'w-full')} {...register('equipamentoVidaUtilAnos')} />
            </div>
          </div>
        </div>
      )}

      <div>
        <label htmlFor="evento-observacao" className="text-[11px] text-muted-foreground block mb-1">
          Observação
        </label>
        <textarea
          id="evento-observacao"
          className={cn(estiloInput, 'w-full min-h-[60px]')}
          placeholder="O que aconteceu ou justificativa da reprogramação..."
          {...register('observacao')}
        />
      </div>
      <button
        type="submit"
        disabled={isSubmitting}
        className={cn(estiloInput, 'cursor-pointer bg-success text-success-foreground border-none justify-self-start font-semibold')}
      >
        {isSubmitting ? 'Enviando...' : rotuloSubmit}
      </button>
      </form>
      <Dialog open={Boolean(conclusaoPendente)} onOpenChange={(aberto) => !aberto && setConclusaoPendente(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar inauguração</DialogTitle>
            <DialogDescription>
              {previsaoInauguracao === conclusaoPendente?.dataOcorrencia
                ? `A previsão registrada (${previsaoInauguracao}) é igual à data de conclusão. Confirme a inauguração nessa data.`
                : previsaoInauguracao
                ? `A previsão registrada é ${previsaoInauguracao}. Confirme a inauguração na data real de conclusão informada.`
                : 'Não há previsão registrada. A inauguração será registrada na data de conclusão informada.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConclusaoPendente(null)}>Voltar</Button>
            <Button
              onClick={async () => {
                if (!conclusaoPendente) return;
                await onRegistrar({ ...conclusaoPendente, confirmarInauguracao: true });
                setConclusaoPendente(null);
              }}
            >
              Confirmar inauguração
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
