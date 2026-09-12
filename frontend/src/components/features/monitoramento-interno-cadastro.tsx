/** Seção "Cadastro interno" -- visão (sempre) + form de edição (achado
 * 2026-09-09: antes disso não existia NENHUM jeito de editar esses campos
 * além de rodar o script de seed de novo). Extraído de
 * MonitoramentoInterno.tsx. */
import { useState } from 'react';
import { colors } from '@/styles/tokens';
import type { InstrumentoEquipamento } from '@/services/monitoramento';
import type { CadastroInternoFormValues } from '@/lib/validations/monitoramento';
import { MonitoramentoInternoFormCadastro } from './monitoramento-interno-form-cadastro';
import { SecaoOperacional, estiloInput } from './monitoramento-ui';

const CAMPOS_VISAO: { rotulo: string; campo: keyof InstrumentoEquipamento }[] = [
  { rotulo: 'Técnico titular', campo: 'tecnico_titular' },
  { rotulo: 'Técnico suplente', campo: 'tecnico_suplente' },
  { rotulo: 'Nível', campo: 'nivel_monitoramento' },
  { rotulo: 'Finalidade', campo: 'finalidade' },
  { rotulo: 'Modalidade', campo: 'modalidade_onco' },
  { rotulo: 'Responsável na instituição', campo: 'responsavel_execucao_nome' },
];

export function MonitoramentoInternoCadastro({
  instrumento,
  podeEditar,
  onSalvar,
}: {
  instrumento: InstrumentoEquipamento;
  podeEditar: boolean;
  onSalvar: (valores: CadastroInternoFormValues) => Promise<void>;
}) {
  const [cadastroAberto, setCadastroAberto] = useState(false);

  return (
    <SecaoOperacional
      titulo="Cadastro interno"
      subtitulo="Campos mantidos pela equipe para qualificar o acompanhamento do instrumento."
      acao={
        <button
          onClick={() => setCadastroAberto((v) => !v)}
          disabled={!podeEditar}
          aria-expanded={cadastroAberto}
          style={{ ...estiloInput, cursor: 'pointer', background: 'transparent', color: colors.primary, border: `1px solid ${colors.primary}`, fontWeight: 600, padding: '4px 10px' }}
        >
          {cadastroAberto ? 'Cancelar' : 'Editar cadastro'}
        </button>
      }
    >
      {cadastroAberto ? (
        <MonitoramentoInternoFormCadastro
          instrumento={instrumento}
          onSalvar={async (valores) => {
            try {
              await onSalvar(valores);
              setCadastroAberto(false);
            } catch {
              // Erro de escrita já vira o banner global da página (ver
              // orquestrador) -- aqui só evita rejeição não tratada e
              // mantém o form aberto pro usuário tentar de novo.
            }
          }}
        />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
          {CAMPOS_VISAO.map(({ rotulo, campo }) => (
            <div key={rotulo} style={{ borderTop: `1px solid ${colors.border}`, paddingTop: 8 }}>
              <div style={{ fontSize: 10.5, color: colors.mutedText, fontWeight: 800, textTransform: 'uppercase' }}>{rotulo}</div>
              <div style={{ fontSize: 12.5, color: colors.primaryDark, marginTop: 3 }}>{(instrumento[campo] as string | null) || '—'}</div>
            </div>
          ))}
        </div>
      )}
    </SecaoOperacional>
  );
}
