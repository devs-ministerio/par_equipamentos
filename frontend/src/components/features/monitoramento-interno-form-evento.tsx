/** Form "Lançar evento" -- React Hook Form + zod, campos condicionais por
 * grupo/código do marco selecionado (regulatório pede status/documento/
 * validade; marco de entrega pede o equipamento físico). Extraído de
 * MonitoramentoInterno.tsx. */
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { colors } from '@/styles/tokens';
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
    <form onSubmit={handleSubmit(aoSubmeter)} style={{ ...estiloCard, marginBottom: 16, display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <label htmlFor="evento-marco" style={{ fontSize: 11, color: colors.mutedText, display: 'block', marginBottom: 4 }}>
            Marco
          </label>
          <select
            id="evento-marco"
            style={{ ...estiloInput, width: '100%' }}
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
          <label htmlFor="evento-data-ocorrencia" style={{ fontSize: 11, color: colors.mutedText, display: 'block', marginBottom: 4 }}>
            {ehLicencaOperacao ? 'Data da licença' : ehRegulatorio ? 'Data do documento' : 'Data de ocorrência'}
          </label>
          <input id="evento-data-ocorrencia" type="date" style={estiloInput} {...register('dataOcorrencia')} />
        </div>
      </div>

      {ehRegulatorio && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 160 }}>
            <label htmlFor="evento-status-regulatorio" style={{ fontSize: 11, color: colors.mutedText, display: 'block', marginBottom: 4 }}>
              Status regulatório
            </label>
            <select id="evento-status-regulatorio" style={{ ...estiloInput, width: '100%' }} defaultValue="" {...register('statusRegulatorio')}>
              <option value="">Status regulatório...</option>
              {STATUS_REGULATORIO_OPCOES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 160 }}>
            <label htmlFor="evento-numero-documento" style={{ fontSize: 11, color: colors.mutedText, display: 'block', marginBottom: 4 }}>
              Nº matrícula/licença/processo
            </label>
            <input id="evento-numero-documento" style={{ ...estiloInput, width: '100%' }} {...register('numeroDocumento')} />
          </div>
          <div>
            <label htmlFor="evento-data-validade" style={{ fontSize: 11, color: colors.mutedText, display: 'block', marginBottom: 4 }}>
              Data de validade
            </label>
            <input id="evento-data-validade" type="date" style={estiloInput} {...register('dataValidade')} />
          </div>
        </div>
      )}

      {ehEntrega && (
        <div>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: colors.primary, marginBottom: 8 }}>
            Equipamento entregue{' '}
            <span style={{ fontWeight: 400, color: colors.mutedText, textTransform: 'none' }}>(informado pelo estabelecimento, opcional)</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
            <div>
              <label htmlFor="evento-equip-marca" style={{ fontSize: 11, color: colors.mutedText, display: 'block', marginBottom: 4 }}>Marca</label>
              <input id="evento-equip-marca" style={{ ...estiloInput, width: '100%' }} {...register('equipamentoMarca')} />
            </div>
            <div>
              <label htmlFor="evento-equip-modelo" style={{ fontSize: 11, color: colors.mutedText, display: 'block', marginBottom: 4 }}>Modelo</label>
              <input id="evento-equip-modelo" style={{ ...estiloInput, width: '100%' }} {...register('equipamentoModelo')} />
            </div>
            <div>
              <label htmlFor="evento-equip-serie" style={{ fontSize: 11, color: colors.mutedText, display: 'block', marginBottom: 4 }}>Nº de série</label>
              <input id="evento-equip-serie" style={{ ...estiloInput, width: '100%' }} {...register('equipamentoNumeroSerie')} />
            </div>
            <div>
              <label htmlFor="evento-equip-vida-util" style={{ fontSize: 11, color: colors.mutedText, display: 'block', marginBottom: 4 }}>Vida útil (anos)</label>
              <input id="evento-equip-vida-util" type="number" min={0} style={{ ...estiloInput, width: '100%' }} {...register('equipamentoVidaUtilAnos')} />
            </div>
          </div>
        </div>
      )}

      <div>
        <label htmlFor="evento-observacao" style={{ fontSize: 11, color: colors.mutedText, display: 'block', marginBottom: 4 }}>
          Observação
        </label>
        <textarea
          id="evento-observacao"
          style={{ ...estiloInput, width: '100%', minHeight: 60 }}
          placeholder="O que aconteceu..."
          {...register('observacao')}
        />
      </div>
      <button
        type="submit"
        disabled={isSubmitting}
        style={{ ...estiloInput, cursor: 'pointer', background: colors.hiperGreen, color: '#fff', border: 'none', justifySelf: 'start', fontWeight: 600 }}
      >
        {isSubmitting ? 'Enviando...' : 'Registrar evento'}
      </button>
    </form>
  );
}
