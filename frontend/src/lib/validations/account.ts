import { z } from "zod";

/** Espelho de `_validar_senha` (backend/app/schemas.py): só tamanho mínimo. */
export const TAMANHO_MINIMO_SENHA = 10;

export const senhaContaSchema = z
  .object({
    senha: z
      .string()
      .min(
        TAMANHO_MINIMO_SENHA,
        `A senha deve ter pelo menos ${TAMANHO_MINIMO_SENHA} caracteres.`,
      ),
    confirmarSenha: z.string().min(1, "Confirme a senha."),
  })
  .refine(({ senha, confirmarSenha }) => senha === confirmarSenha, {
    path: ["confirmarSenha"],
    message: "As senhas informadas precisam ser iguais.",
  });

export type SenhaContaFormValues = z.infer<typeof senhaContaSchema>;

export const recuperarContaSchema = z.object({
  email: z.string().trim().min(1, "Informe o email.").email("Email inválido."),
});

export type RecuperarContaFormValues = z.infer<typeof recuperarContaSchema>;
