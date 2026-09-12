/** Form "Nova ação" -- React Hook Form + zod. Extraído de
 * MonitoramentoInterno.tsx. */
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { cn } from '@/lib/utils';
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
    <form onSubmit={handleSubmit(aoSubmeter)} className="flex gap-2.5 flex-wrap items-start mb-3.5">
      <div className="flex-[2] min-w-[220px]">
        <label htmlFor="acao-descricao" className="text-[11px] text-muted-foreground block mb-1">
          Nova ação
        </label>
        <input
          id="acao-descricao"
          className={cn(estiloInput, 'w-full')}
          placeholder="O que precisa ser feito..."
          aria-invalid={Boolean(errors.descricao)}
          aria-describedby={idsDescricaoCampo('acao-descricao', Boolean(errors.descricao), false)}
          {...register('descricao')}
        />
        <ErroCampo id="acao-descricao-error" mensagem={errors.descricao?.message} />
      </div>
      <div>
        <label htmlFor="acao-data-prevista" className="text-[11px] text-muted-foreground block mb-1">
          Prazo
        </label>
        <input id="acao-data-prevista" type="date" className={estiloInput} {...register('dataPrevista')} />
      </div>
      <div className="min-w-40">
        <label htmlFor="acao-responsavel" className="text-[11px] text-muted-foreground block mb-1">
          Responsável
        </label>
        <input id="acao-responsavel" className={cn(estiloInput, 'w-full')} {...register('responsavel')} />
      </div>
      <button
        type="submit"
        disabled={!podeEditar || isSubmitting}
        className={cn(estiloInput, 'cursor-pointer bg-primary text-primary-foreground border-none font-semibold')}
      >
        {isSubmitting ? 'Adicionando...' : '+ Adicionar'}
      </button>
    </form>
  );
}
