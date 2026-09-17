import { useQuery } from '@tanstack/react-query';
import { fetchConvenioDetalhe } from '@/services/convenios';
import { ApiError } from '@/lib/api-error';

/** Nome do programa (SICONV `NOME_PROGRAMA`, ver `Convenio.programa` no
 * backend) de UM convênio, por número -- fallback de "Componente" no
 * monitoramento interno quando `inst.componente` vem nulo (achado
 * 2026-09-10, convênio 991708: a planilha da equipe deixou a célula vazia,
 * mas o SICONV tem o programa). Antes buscava `siconv.json` inteiro
 * (5,3MB, estático em `public/`, sem controle de acesso nenhum -- Plan
 * Mode segurança 2026-09-16, Bloco 5) e procurava por `nr_convenio` no
 * cliente; agora é 1 lookup autenticado por número, direto em
 * `GET /convenios/{numero}` (mesma tabela que já substituiu
 * convenios.json/siconv.json/transferegov.json em outras telas).
 *
 * `null` = convênio não encontrado na tabela `convenio` (404 -- caso
 * normal pra FAF/TED, cujo `nr_convenio` é o NUP SEI, não um número real
 * de convênio do Portal/SICONV) ou sem `programa` preenchido. */
export function useConvenioPrograma(nrConvenio: string) {
  return useQuery({
    queryKey: ['convenio-programa', nrConvenio],
    queryFn: async (): Promise<string | null> => {
      try {
        const convenio = await fetchConvenioDetalhe(nrConvenio);
        return convenio.programa;
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }
    },
  });
}
