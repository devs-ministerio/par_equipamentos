/** Form "Lançar evento" -- React Hook Form + zod, campos condicionais por
 * grupo/código do marco selecionado (regulatório pede status/documento/
 * validade; marco de entrega pede o equipamento físico). Extraído de
 * MonitoramentoInterno.tsx. */
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { cn } from '@/lib/utils';
import type { MarcoCatalogo } from '@/services/monitoramento';
import { enviarEventoSchema, type EnviarEventoFormValues } from '@/lib/validations/monitoramento';
import { ErroCampo, estiloCard, estiloInput, idsDescricaoCampo } from './monitoramento-ui';

const STATUS_REGULATORIO_OPCOES = ['NI', 'NA', 'Em análise', 'Em diligência', 'Deferido', 'Indeferido'];

const GRUPOS: { chave: MarcoCatalogo['grupo']; rotulo: string }[] = [
  { chave: 'fase_geral', rotulo: 'Fase geral' },
  { chave: 'cronograma_fisico', rotulo: 'Cronograma físico' },
  { chave: 'regulatorio', rotulo: 'Regulatório (CNEN)' },
];

export function MonitoramentoInternoFormEvento({
  marcos,
  onRegistrar,
}: {
  marcos: MarcoCatalogo[];
  onRegistrar: (valores: EnviarEventoFormValues) => Promise<void>;
}) {
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<EnviarEventoFormValues>({ resolver: zodResolver(enviarEventoSchema) });

  const marcoIdSelecionado = watch('marcoId');
  const marcoDoForm = marcos.find((m) => String(m.id) === marcoIdSelecionado);
  const ehRegulatorio = marcoDoForm?.grupo === 'regulatorio';
  const ehLicencaOperacao = marcoDoForm?.codigo === 'regulatorio_licenca_operacao';
  // Achado 2026-09-09, 2a rodada (pedido do usuario: "o equipamento
  // entregue pode mover para eventos") -- so o marco de entrega pede os
  // campos fisicos, junto do mesmo lancamento.
  const ehEntrega = marcoDoForm?.codigo === 'cronograma_entrega';

  async function aoSubmeter(valores: EnviarEventoFormValues) {
    try {
      await onRegistrar(valores);
    } catch {
      // Erro de escrita vira o banner global da página.
    }
  }

  return (
    <form onSubmit={handleSubmit(aoSubmeter)} className={cn(estiloCard, 'mb-4 grid gap-2.5')}>
      <div className="flex gap-2.5 flex-wrap items-start">
        <div className="flex-1 min-w-60">
          <label htmlFor="evento-marco" className="text-[11px] text-muted-foreground block mb-1">
            Marco
          </label>
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
          <ErroCampo id="evento-marco-error" mensagem={errors.marcoId?.message} />
        </div>
        <div>
          {/* Rotulo dinamico -- pedido do usuario 2026-09-09: "a licenca
              cnen vamos precisar da data da licença e da data de validade
              da licença", nao so um icone de calendario com tooltip. */}
          <label htmlFor="evento-data-ocorrencia" className="text-[11px] text-muted-foreground block mb-1">
            {ehLicencaOperacao ? 'Data da licença' : ehRegulatorio ? 'Data do documento' : 'Data de ocorrência'}
          </label>
          <input id="evento-data-ocorrencia" type="date" className={estiloInput} {...register('dataOcorrencia')} />
        </div>
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
          placeholder="O que aconteceu..."
          {...register('observacao')}
        />
      </div>
      <button
        type="submit"
        disabled={isSubmitting}
        className={cn(estiloInput, 'cursor-pointer bg-success text-success-foreground border-none justify-self-start font-semibold')}
      >
        {isSubmitting ? 'Enviando...' : 'Registrar evento'}
      </button>
    </form>
  );
}
