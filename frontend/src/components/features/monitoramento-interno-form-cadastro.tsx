/** Form de "Cadastro interno" (técnico titular/suplente, nível de
 * monitoramento, finalidade, modalidade + responsável técnico da execução
 * na instituição) -- React Hook Form + zod. Extraído de
 * MonitoramentoInterno.tsx. */
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { cn } from '@/lib/utils';
import type { InstrumentoEquipamento } from '@/services/monitoramento';
import { cadastroInternoSchema, type CadastroInternoFormValues } from '@/lib/validations/monitoramento';
import { estiloInput } from './monitoramento-ui';

const CAMPOS: { nome: keyof CadastroInternoFormValues; rotulo: string }[] = [
  { nome: 'tecnicoTitular', rotulo: 'Técnico titular' },
  { nome: 'tecnicoSuplente', rotulo: 'Técnico suplente' },
  { nome: 'nivelMonitoramento', rotulo: 'Nível de monitoramento' },
  { nome: 'finalidade', rotulo: 'Finalidade' },
  { nome: 'modalidadeOnco', rotulo: 'Modalidade' },
];

function valoresIniciais(inst: InstrumentoEquipamento): CadastroInternoFormValues {
  return {
    tecnicoTitular: inst.tecnico_titular ?? '',
    tecnicoSuplente: inst.tecnico_suplente ?? '',
    nivelMonitoramento: inst.nivel_monitoramento ?? '',
    finalidade: inst.finalidade ?? '',
    modalidadeOnco: inst.modalidade_onco ?? '',
    responsavelExecucaoNome: inst.responsavel_execucao_nome ?? '',
    responsavelExecucaoContato: inst.responsavel_execucao_contato ?? '',
  };
}

export function MonitoramentoInternoFormCadastro({
  instrumento,
  onSalvar,
}: {
  instrumento: InstrumentoEquipamento;
  onSalvar: (valores: CadastroInternoFormValues) => Promise<void>;
}) {
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<CadastroInternoFormValues>({
    resolver: zodResolver(cadastroInternoSchema),
    defaultValues: valoresIniciais(instrumento),
  });

  return (
    <form onSubmit={handleSubmit(onSalvar)} className="grid gap-4">
      <div className="grid [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))] gap-2.5">
        {CAMPOS.map(({ nome, rotulo }) => (
          <div key={nome}>
            <label htmlFor={`cadastro-${nome}`} className="text-[11px] text-muted-foreground block mb-1">
              {rotulo}
            </label>
            <input id={`cadastro-${nome}`} className={cn(estiloInput, 'w-full')} {...register(nome)} />
          </div>
        ))}
      </div>
      {/* Responsavel tecnico da execucao NA INSTITUICAO/convenente --
          DIFERENTE dos campos de tecnico titular/suplente acima (nossa
          equipe). Opcional, sem exigir preenchimento. */}
      <div>
        <div className="text-[11.5px] font-bold text-primary mb-2">
          Responsável técnico da execução{' '}
          <span className="font-normal text-muted-foreground normal-case">(na instituição/convenente, opcional)</span>
        </div>
        <div className="grid [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))] gap-2.5">
          <div>
            <label htmlFor="cadastro-responsavelExecucaoNome" className="text-[11px] text-muted-foreground block mb-1">
              Nome
            </label>
            <input id="cadastro-responsavelExecucaoNome" className={cn(estiloInput, 'w-full')} {...register('responsavelExecucaoNome')} />
          </div>
          <div>
            <label htmlFor="cadastro-responsavelExecucaoContato" className="text-[11px] text-muted-foreground block mb-1">
              Contato
            </label>
            <input id="cadastro-responsavelExecucaoContato" className={cn(estiloInput, 'w-full')} {...register('responsavelExecucaoContato')} />
          </div>
        </div>
      </div>
      <button
        type="submit"
        disabled={isSubmitting}
        className={cn(estiloInput, 'cursor-pointer bg-success text-success-foreground border-none justify-self-start font-semibold')}
      >
        {isSubmitting ? 'Salvando...' : 'Salvar cadastro'}
      </button>
    </form>
  );
}
