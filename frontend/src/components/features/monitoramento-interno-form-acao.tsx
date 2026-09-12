/** Form "Nova ação" -- React Hook Form + zod. Extraído de
 * MonitoramentoInterno.tsx. */
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { colors } from '@/styles/tokens';
import { criarAcaoSchema, type CriarAcaoFormValues } from '@/lib/validations/monitoramento';
import { ErroCampo, estiloInput, idsDescricaoCampo } from './monitoramento-ui';

export function MonitoramentoInternoFormAcao({
  podeEditar,
  onCriar,
}: {
  podeEditar: boolean;
  onCriar: (valores: CriarAcaoFormValues) => Promise<void>;
}) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CriarAcaoFormValues>({ resolver: zodResolver(criarAcaoSchema) });

  async function aoSubmeter(valores: CriarAcaoFormValues) {
    try {
      await onCriar(valores);
      reset();
    } catch {
      // Erro de escrita vira o banner global da página.
    }
  }

  return (
    <form onSubmit={handleSubmit(aoSubmeter)} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: 14 }}>
      <div style={{ flex: 2, minWidth: 220 }}>
        <label htmlFor="acao-descricao" style={{ fontSize: 11, color: colors.mutedText, display: 'block', marginBottom: 4 }}>
          Nova ação
        </label>
        <input
          id="acao-descricao"
          style={{ ...estiloInput, width: '100%' }}
          placeholder="O que precisa ser feito..."
          aria-invalid={Boolean(errors.descricao)}
          aria-describedby={idsDescricaoCampo('acao-descricao', Boolean(errors.descricao), false)}
          {...register('descricao')}
        />
        <ErroCampo id="acao-descricao-error" mensagem={errors.descricao?.message} />
      </div>
      <div>
        <label htmlFor="acao-data-prevista" style={{ fontSize: 11, color: colors.mutedText, display: 'block', marginBottom: 4 }}>
          Prazo
        </label>
        <input id="acao-data-prevista" type="date" style={estiloInput} {...register('dataPrevista')} />
      </div>
      <div style={{ minWidth: 160 }}>
        <label htmlFor="acao-responsavel" style={{ fontSize: 11, color: colors.mutedText, display: 'block', marginBottom: 4 }}>
          Responsável
        </label>
        <input id="acao-responsavel" style={{ ...estiloInput, width: '100%' }} {...register('responsavel')} />
      </div>
      <button
        type="submit"
        disabled={!podeEditar || isSubmitting}
        style={{ ...estiloInput, cursor: 'pointer', background: colors.primary, color: '#fff', border: 'none', fontWeight: 600 }}
      >
        {isSubmitting ? 'Adicionando...' : '+ Adicionar'}
      </button>
    </form>
  );
}
