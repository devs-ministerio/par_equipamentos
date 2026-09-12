/** Seção "Cadastro interno" -- visão (sempre) + form de edição (achado
 * 2026-09-09: antes disso não existia NENHUM jeito de editar esses campos
 * além de rodar o script de seed de novo). Extraído de
 * MonitoramentoInterno.tsx. */
import { useState } from 'react';
import { cn } from '@/lib/utils';
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
          className={cn(estiloInput, 'cursor-pointer bg-transparent text-primary border border-primary font-semibold py-1 px-2.5')}
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
        <div className="grid [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))] gap-2.5">
          {CAMPOS_VISAO.map(({ rotulo, campo }) => (
            <div key={rotulo} className="border-t border-border pt-2">
              <div className="text-[10.5px] text-muted-foreground font-extrabold uppercase">{rotulo}</div>
              <div className="text-[12.5px] text-foreground mt-[3px]">{(instrumento[campo] as string | null) || '—'}</div>
            </div>
          ))}
        </div>
      )}
    </SecaoOperacional>
  );
}
