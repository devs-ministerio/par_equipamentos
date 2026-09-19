/** Seção "Cadastro interno" -- visão (sempre) + form de edição (achado
 * 2026-09-09: antes disso não existia NENHUM jeito de editar esses campos
 * além de rodar o script de seed de novo). Extraído de
 * MonitoramentoInterno.tsx.
 *
 * Estado de abertura CONTROLADO pelo pai (Plan Mode monitoramento-evolucao
 * 2026-09-19) -- o botão "Editar CNES" do cabeçalho abre esta mesma seção
 * em modo `somenteCnes`, então o pai precisa poder forçar a abertura. */
import { cn } from '@/lib/utils';
import type { InstrumentoEquipamento } from '@/services/monitoramento-instrumentos';
import type { CadastroInternoFormValues } from '@/lib/validations/monitoramento';
import { TIPOLOGIA_PERSUS } from '@/data/constants';
import { MonitoramentoInternoFormCadastro } from './monitoramento-interno-form-cadastro';
import { SecaoOperacional, estiloInput } from './monitoramento-ui';

const CAMPOS_VISAO: { rotulo: string; campo: keyof InstrumentoEquipamento; formatar?: (v: string) => string }[] = [
  { rotulo: 'Técnico titular', campo: 'tecnico_titular' },
  { rotulo: 'Técnico suplente', campo: 'tecnico_suplente' },
  { rotulo: 'Nível', campo: 'nivel_monitoramento' },
  { rotulo: 'Tipologia', campo: 'tipologia', formatar: (v) => TIPOLOGIA_PERSUS[v] ?? v },
  { rotulo: 'Modalidade', campo: 'modalidade_onco' },
  { rotulo: 'Responsável na instituição', campo: 'responsavel_execucao_nome' },
];

export function MonitoramentoInternoCadastro({
  instrumento,
  podeEditar,
  aberto,
  somenteCnes,
  onAbrir,
  onFechar,
  onSalvar,
}: {
  instrumento: InstrumentoEquipamento;
  podeEditar: boolean;
  aberto: boolean;
  somenteCnes: boolean;
  onAbrir: () => void;
  onFechar: () => void;
  onSalvar: (valores: CadastroInternoFormValues) => Promise<void>;
}) {
  return (
    <SecaoOperacional
      titulo="Cadastro interno"
      acao={
        <button
          onClick={() => (aberto ? onFechar() : onAbrir())}
          disabled={!podeEditar}
          aria-expanded={aberto}
          className={cn(estiloInput, 'cursor-pointer bg-transparent text-primary border border-primary font-semibold py-1 px-2.5')}
        >
          {aberto ? 'Cancelar' : 'Editar cadastro'}
        </button>
      }
    >
      {aberto ? (
        <MonitoramentoInternoFormCadastro
          instrumento={instrumento}
          somenteCnes={somenteCnes}
          onSalvar={async (valores) => {
            try {
              await onSalvar(valores);
              onFechar();
            } catch {
              // Erro de escrita já vira o banner global da página (ver
              // orquestrador) -- aqui só evita rejeição não tratada e
              // mantém o form aberto pro usuário tentar de novo.
            }
          }}
        />
      ) : (
        <div className="grid [grid-template-columns:repeat(auto-fit,minmax(min(190px,100%),1fr))] gap-2.5">
          {CAMPOS_VISAO.map(({ rotulo, campo, formatar }) => {
            const valor = instrumento[campo] as string | null;
            return (
              <div key={rotulo} className="border-t border-border pt-2">
                <div className="text-[10.5px] text-muted-foreground font-extrabold uppercase">{rotulo}</div>
                <div className="text-[12.5px] text-foreground mt-[3px]">{valor ? (formatar ? formatar(valor) : valor) : '—'}</div>
              </div>
            );
          })}
        </div>
      )}
    </SecaoOperacional>
  );
}
