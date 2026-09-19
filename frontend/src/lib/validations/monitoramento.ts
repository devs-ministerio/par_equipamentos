import { z } from 'zod';

/** Schemas de VALIDAÇÃO de form (React Hook Form + zodResolver) -- diferente
 * dos schemas de RESPOSTA de API em services/monitoramento.ts. Um por form
 * de MonitoramentoInterno (login, cadastro interno, criar ação, enviar
 * evento), espelhando exatamente as regras que já existiam via atributos
 * HTML (`required`, `type="email"`) antes da migração -- não é validação
 * nova, só a mesma regra expressa em zod. */

export const loginSchema = z.object({
  email: z.string().min(1, 'Informe o email.').email('Email inválido.'),
  senha: z.string().min(1, 'Informe a senha.'),
});
export type LoginFormValues = z.infer<typeof loginSchema>;

export const cadastroInternoSchema = z.object({
  tecnicoTitular: z.string().optional(),
  tecnicoSuplente: z.string().optional(),
  nivelMonitoramento: z.string().optional(),
  finalidade: z.string().optional(),
  modalidadeOnco: z.string().optional(),
  responsavelExecucaoNome: z.string().optional(),
  responsavelExecucaoContato: z.string().optional(),
});
export type CadastroInternoFormValues = z.infer<typeof cadastroInternoSchema>;

export const criarAcaoSchema = z.object({
  descricao: z.string().trim().min(1, 'Descreva o que precisa ser feito.'),
  dataPrevista: z.string().optional(),
  responsavel: z.string().optional(),
});
export type CriarAcaoFormValues = z.infer<typeof criarAcaoSchema>;

export const enviarEventoSchema = z.object({
  marcoId: z.string().min(1, 'Selecione o marco.'),
  dataOcorrencia: z.string().optional(),
  dataPrevista: z.string().optional(),
  statusRegulatorio: z.string().optional(),
  numeroDocumento: z.string().optional(),
  dataValidade: z.string().optional(),
  observacao: z.string().optional(),
  equipamentoMarca: z.string().optional(),
  equipamentoModelo: z.string().optional(),
  equipamentoNumeroSerie: z.string().optional(),
  equipamentoVidaUtilAnos: z.string().optional(),
});
export type EnviarEventoFormValues = z.infer<typeof enviarEventoSchema>;
