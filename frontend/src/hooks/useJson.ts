import { useEffect, useState } from 'react';

/** Busca um JSON estatico de public/ -- as 3 fontes (Portal/SICONV/
 * TransfereGov) sao pre-processadas por backend/scripts/coletar_*.py, sem
 * chamada de API a partir do frontend (ver README em
 * public/monitoramento-equipamentos/). */
export function useJson<T>(url: string) {
  const [dados, setDados] = useState<T | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setDados)
      .catch((e) => setErro(String(e)));
  }, [url]);
  return { dados, erro };
}
