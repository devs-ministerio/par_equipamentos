/** Form de "Cadastro interno" (técnico titular/suplente, nível de
 * monitoramento, tipologia, modalidade, CNES + responsável técnico da
 * execução na instituição) -- React Hook Form + zod. Extraído de
 * MonitoramentoInterno.tsx.
 *
 * Todo campo é lista suspensa, EXCETO responsável técnico da execução
 * (nome/contato da instituição/convenente -- texto livre, não tem
 * vocabulário fechado) -- achado 2026-09-15, pedido do usuário: "no
 * cadastro interno todos os campos deverão ser por seleção (lista
 * suspensa) exceto os dados do responsável técnico da execução". Opções
 * vêm de monitoramento-opcoes.ts (extraídas de dado real, nunca
 * inventadas).
 *
 * `somenteCnes` (Plan Mode monitoramento-evolucao 2026-09-19, decisão do
 * usuário: "o botão Editar CNES ... vai abrir pra editar tudo do card, mas
 * apenas o CNES estará disponível") -- mesmo form de "Editar cadastro",
 * só que com todos os campos exceto CNES desabilitados via `<fieldset
 * disabled>`. Substitui o toggle inline que existia antes no cabeçalho. */
import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { cn } from '@/lib/utils';
import type { InstrumentoEquipamento } from '@/services/monitoramento-instrumentos';
import { cadastroInternoSchema, type CadastroInternoFormValues } from '@/lib/validations/monitoramento';
import { comValorAtual, MODALIDADES_ONCO, NIVEIS_MONITORAMENTO, TECNICOS_EQUIPE } from '@/lib/monitoramento-opcoes';
import { TIPOLOGIA_PERSUS } from '@/data/constants';
import { CnesPicker } from '@/components/common/cnes-picker';
import { estiloInput } from './monitoramento-ui';

const CAMPOS_SELECT: { nome: keyof CadastroInternoFormValues; rotulo: string; opcoes: string[] }[] = [
  { nome: 'tecnicoTitular', rotulo: 'Técnico titular', opcoes: TECNICOS_EQUIPE },
  { nome: 'tecnicoSuplente', rotulo: 'Técnico suplente', opcoes: TECNICOS_EQUIPE },
  { nome: 'nivelMonitoramento', rotulo: 'Nível de monitoramento', opcoes: NIVEIS_MONITORAMENTO },
  { nome: 'modalidadeOnco', rotulo: 'Modalidade', opcoes: MODALIDADES_ONCO },
];

const TIPOLOGIA_CODIGOS = Object.keys(TIPOLOGIA_PERSUS);

function valoresIniciais(inst: InstrumentoEquipamento): CadastroInternoFormValues {
  return {
    tecnicoTitular: inst.tecnico_titular ?? '',
    tecnicoSuplente: inst.tecnico_suplente ?? '',
    nivelMonitoramento: inst.nivel_monitoramento ?? '',
    tipologia: inst.tipologia ?? '',
    modalidadeOnco: inst.modalidade_onco ?? '',
    responsavelExecucaoNome: inst.responsavel_execucao_nome ?? '',
    responsavelExecucaoContato: inst.responsavel_execucao_contato ?? '',
    cnes: inst.cnes ?? '',
  };
}

export function MonitoramentoInternoFormCadastro({
  instrumento,
  onSalvar,
  somenteCnes = false,
}: {
  instrumento: InstrumentoEquipamento;
  onSalvar: (valores: CadastroInternoFormValues) => Promise<void>;
  somenteCnes?: boolean;
}) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { isSubmitting },
  } = useForm<CadastroInternoFormValues>({
    resolver: zodResolver(cadastroInternoSchema),
    defaultValues: valoresIniciais(instrumento),
  });
  const [editandoCnes, setEditandoCnes] = useState(false);
  const cnesAtual = watch('cnes');

  return (
    <form onSubmit={handleSubmit(onSalvar)} className="grid gap-4">
      <div>
        <label className="text-[11px] text-muted-foreground block mb-1">CNES</label>
        <div className="relative flex items-center gap-2">
          <span className={cn(estiloInput, 'inline-block min-w-[110px]')}>{cnesAtual || '— Não informado —'}</span>
          <button
            type="button"
            onClick={() => setEditandoCnes((v) => !v)}
            className="text-[10.5px] font-semibold text-primary hover:underline"
          >
            editar
          </button>
          {editandoCnes && (
            <CnesPicker
              valorAtual={cnesAtual || null}
              onEscolher={(cnes) => {
                setValue('cnes', cnes ?? '');
                setEditandoCnes(false);
              }}
              onCancelar={() => setEditandoCnes(false)}
            />
          )}
        </div>
      </div>
      <fieldset disabled={somenteCnes} className={cn('grid gap-4', somenteCnes && 'opacity-50')}>
        <div className="grid [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))] gap-2.5">
          {CAMPOS_SELECT.map(({ nome, rotulo, opcoes }) => (
            <div key={nome}>
              <label htmlFor={`cadastro-${nome}`} className="text-[11px] text-muted-foreground block mb-1">
                {rotulo}
              </label>
              <select id={`cadastro-${nome}`} className={cn(estiloInput, 'w-full bg-background')} {...register(nome)}>
                <option value="">— Não informado —</option>
                {comValorAtual(opcoes, instrumento[snakeDoCampo(nome)] as string | null).map((op) => (
                  <option key={op} value={op}>
                    {op}
                  </option>
                ))}
              </select>
            </div>
          ))}
          <div>
            <label htmlFor="cadastro-tipologia" className="text-[11px] text-muted-foreground block mb-1">
              Tipologia
            </label>
            <select id="cadastro-tipologia" className={cn(estiloInput, 'w-full bg-background')} {...register('tipologia')}>
              <option value="">— Não informado —</option>
              {comValorAtual(TIPOLOGIA_CODIGOS, instrumento.tipologia).map((codigo) => (
                <option key={codigo} value={codigo}>
                  {TIPOLOGIA_PERSUS[codigo] ?? codigo}
                </option>
              ))}
            </select>
          </div>
        </div>
        {/* Responsavel tecnico da execucao NA INSTITUICAO/convenente --
            DIFERENTE dos campos de tecnico titular/suplente acima (nossa
            equipe). Opcional, sem exigir preenchimento. So esses 2 ficam
            texto livre -- nome/contato de pessoa nao tem vocabulario fechado. */}
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
      </fieldset>
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

/** CadastroInternoFormValues usa camelCase (RHF), InstrumentoEquipamento
 * usa snake_case (schema do backend) -- só os campos-select precisam
 * desse de-para pra achar o valor atual (comValorAtual). */
function snakeDoCampo(nome: keyof CadastroInternoFormValues): keyof InstrumentoEquipamento {
  const mapa: Partial<Record<keyof CadastroInternoFormValues, keyof InstrumentoEquipamento>> = {
    tecnicoTitular: 'tecnico_titular',
    tecnicoSuplente: 'tecnico_suplente',
    nivelMonitoramento: 'nivel_monitoramento',
    tipologia: 'tipologia',
    modalidadeOnco: 'modalidade_onco',
  };
  return mapa[nome] ?? (nome as keyof InstrumentoEquipamento);
}
