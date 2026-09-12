/** Form de "Cadastro interno" (técnico titular/suplente, nível de
 * monitoramento, finalidade, modalidade + responsável técnico da execução
 * na instituição) -- React Hook Form + zod. Extraído de
 * MonitoramentoInterno.tsx. */
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { colors } from '@/styles/tokens';
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
    <form onSubmit={handleSubmit(onSalvar)} style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
        {CAMPOS.map(({ nome, rotulo }) => (
          <div key={nome}>
            <label htmlFor={`cadastro-${nome}`} style={{ fontSize: 11, color: colors.mutedText, display: 'block', marginBottom: 4 }}>
              {rotulo}
            </label>
            <input id={`cadastro-${nome}`} style={{ ...estiloInput, width: '100%' }} {...register(nome)} />
          </div>
        ))}
      </div>
      {/* Responsavel tecnico da execucao NA INSTITUICAO/convenente --
          DIFERENTE dos campos de tecnico titular/suplente acima (nossa
          equipe). Opcional, sem exigir preenchimento. */}
      <div>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: colors.primary, marginBottom: 8 }}>
          Responsável técnico da execução{' '}
          <span style={{ fontWeight: 400, color: colors.mutedText, textTransform: 'none' }}>(na instituição/convenente, opcional)</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
          <div>
            <label htmlFor="cadastro-responsavelExecucaoNome" style={{ fontSize: 11, color: colors.mutedText, display: 'block', marginBottom: 4 }}>
              Nome
            </label>
            <input id="cadastro-responsavelExecucaoNome" style={{ ...estiloInput, width: '100%' }} {...register('responsavelExecucaoNome')} />
          </div>
          <div>
            <label htmlFor="cadastro-responsavelExecucaoContato" style={{ fontSize: 11, color: colors.mutedText, display: 'block', marginBottom: 4 }}>
              Contato
            </label>
            <input id="cadastro-responsavelExecucaoContato" style={{ ...estiloInput, width: '100%' }} {...register('responsavelExecucaoContato')} />
          </div>
        </div>
      </div>
      <button
        type="submit"
        disabled={isSubmitting}
        style={{ ...estiloInput, cursor: 'pointer', background: colors.hiperGreen, color: '#fff', border: 'none', justifySelf: 'start', fontWeight: 600 }}
      >
        {isSubmitting ? 'Salvando...' : 'Salvar cadastro'}
      </button>
    </form>
  );
}
