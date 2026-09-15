/** Botão "Adicionar ao monitoramento interno" -- entrada manual pra um
 * convênio que já está na lista oficial (Portal/SICONV) mas ainda não tem
 * `InstrumentoEquipamento` (achado 2026-09-15, pergunta direta do
 * usuário: "onde está a parte de incluir o convênio no monitoramento
 * interno?" -- só existia a porta automática via proposta aceita).
 * Identidade (nr_convenio/cnpj/nome/programa) já é conhecida pelo card;
 * só o técnico titular precisa ser informado na hora -- pedido do usuário
 * (mesma rodada): "preciso que apareça [uma janela] para incluir o nome
 * do técnico que será responsável" + "uma janelinha de confirmação
 * também". O `log_action` do backend (AuditLog, action="created") já
 * registra quem fez e com qual técnico -- "preciso que fique registrado
 * (log) deste feito". */
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthSession } from '@/hooks/useAuthSession';
import { criarInstrumento } from '@/services/monitoramento';
import { monitoramentoKeys } from '@/hooks/monitoramento-query-keys';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { estiloInput } from './monitoramento-ui';
import type { ConvenioUnificado } from '@/types/monitoramento';

export function AdicionarMonitoramentoButton({ c }: { c: ConvenioUnificado }) {
  const sessao = useAuthSession();
  const queryClient = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [tecnicoTitular, setTecnicoTitular] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      criarInstrumento({
        nr_convenio: c.numero,
        cnpj_convenente: c.convenente.cnpj,
        nome_convenente: c.convenente.nome,
        tipo_contratacao: 'Convênio',
        municipio: c.municipio,
        uf: c.uf,
        tecnico_titular: tecnicoTitular.trim() || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: monitoramentoKeys.instrumentos });
      setAberto(false);
      setTecnicoTitular('');
    },
    onError: (e) => setErro(e instanceof Error ? e.message : 'Falha ao adicionar.'),
  });

  if (!sessao.podeEditar) {
    return (
      <p className="text-xs text-muted-foreground italic m-0">
        Faça login (em qualquer convênio já monitorado, aba "Monitoramento interno") pra adicionar este ao monitoramento.
      </p>
    );
  }

  return (
    <Dialog
      open={aberto}
      onOpenChange={(v) => {
        setAberto(v);
        if (!v) {
          setErro(null);
          setTecnicoTitular('');
        }
      }}
    >
      <Button size="sm" onClick={() => setAberto(true)}>
        + Adicionar ao monitoramento interno
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adicionar convênio {c.numero} ao monitoramento interno</DialogTitle>
          <DialogDescription>
            {c.convenente.nome} — {c.municipio}/{c.uf}. Confirme o técnico titular responsável antes de criar o
            registro.
          </DialogDescription>
        </DialogHeader>

        <div>
          <label htmlFor="tecnico-titular-novo" className="text-[11px] text-muted-foreground block mb-1">
            Técnico titular responsável
          </label>
          <input
            id="tecnico-titular-novo"
            className={`${estiloInput} w-full`}
            value={tecnicoTitular}
            onChange={(e) => setTecnicoTitular(e.target.value)}
            placeholder="Nome do técnico"
            autoFocus
          />
          {erro && <p className="text-xs text-destructive mt-1.5">{erro}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setAberto(false)} disabled={mutation.isPending}>
            Cancelar
          </Button>
          <Button
            onClick={() => {
              setErro(null);
              if (!tecnicoTitular.trim()) {
                setErro('Informe o técnico titular responsável.');
                return;
              }
              mutation.mutate();
            }}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? 'Adicionando...' : 'Confirmar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
