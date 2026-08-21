import type { Regiao } from '../types/domain';

export const REGIOES: Regiao[] = ['Norte', 'Nordeste', 'Centro-Oeste', 'Sudeste', 'Sul'];

export interface EquipamentoOption {
  familia: string;
  rotulo: string;
  /** false enquanto essa familia nao tiver pipeline/dado real (ver
   * docs/design/decan-equipamentos-contexto.md -- escopo maior do projeto:
   * acelerador linear, tomografo, PET-CT, ultrassom, mamografo, ressonancia).
   * TOMOGRAFO (Fase 1) e RESSONANCIA (2026-08-21) tem pipeline hoje. */
  disponivel: boolean;
}

export const EQUIPAMENTOS: EquipamentoOption[] = [
  { familia: 'TOMOGRAFO', rotulo: 'Tomógrafo', disponivel: true },
  { familia: 'RESSONANCIA', rotulo: 'Ressonância Magnética', disponivel: true },
  { familia: 'PET_CT', rotulo: 'PET-CT', disponivel: false },
  { familia: 'ACELERADOR_LINEAR', rotulo: 'Acelerador Linear', disponivel: false },
  { familia: 'ULTRASSOM', rotulo: 'Ultrassom', disponivel: false },
  { familia: 'MAMOGRAFO', rotulo: 'Mamógrafo', disponivel: false },
];
