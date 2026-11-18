import { z } from "zod";
import { apiAuthed, apiGetAuthed } from "./monitoramento-client";

// ---------------------------------------------------------------------
// Documentos do instrumento (backend/app/routers/documentos.py)
// ---------------------------------------------------------------------

export const TIPOS_DOCUMENTO = [
  "nota_fiscal",
  "ordem_servico",
  "trp",
  "trd",
  "cnen_scra",
  "cnen_licenca",
] as const;
export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number];

export const STATUS_CNEN = [
  "Em análise",
  "Em diligência",
  "Deferido",
  "Indeferido",
] as const;

const documentoSchema = z.object({
  id: z.number(),
  tipo: z.enum(TIPOS_DOCUMENTO),
  numero: z.string().nullable(),
  data_documento: z.string(),
  status: z.string().nullable(),
  data_validade: z.string().nullable(),
  observacao: z.string().nullable(),
});
export type DocumentoInstrumento = z.infer<typeof documentoSchema>;

const documentosSchema = z.object({
  nr_convenio: z.string(),
  pode_editar: z.boolean(),
  documentos: z.array(documentoSchema),
});
export type DocumentosInstrumento = z.infer<typeof documentosSchema>;

export interface DocumentoInput {
  tipo: TipoDocumento;
  numero: string | null;
  data_documento: string;
  status: string | null;
  data_validade: string | null;
  observacao: string | null;
}

export function fetchDocumentos(nr: string): Promise<DocumentosInstrumento> {
  return apiGetAuthed(
    `/monitoramento/instrumentos/${encodeURIComponent(nr)}/documentos`,
    documentosSchema,
  );
}

export function registrarDocumento(
  nr: string,
  corpo: DocumentoInput,
): Promise<DocumentoInstrumento> {
  return apiAuthed(
    `/monitoramento/instrumentos/${encodeURIComponent(nr)}/documentos`,
    documentoSchema,
    "POST",
    corpo,
  );
}

export function corrigirDocumento(
  id: number,
  corpo: DocumentoInput,
): Promise<DocumentoInstrumento> {
  return apiAuthed(
    `/monitoramento/documentos/${id}`,
    documentoSchema,
    "PUT",
    corpo,
  );
}

export function excluirDocumento(
  id: number,
  motivo: string,
): Promise<DocumentoInstrumento> {
  return apiAuthed(
    `/monitoramento/documentos/${id}`,
    documentoSchema,
    "DELETE",
    { motivo },
  );
}
