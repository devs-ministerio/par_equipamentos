import { z } from 'zod';

export const senhaContaSchema = z
  .object({
    senha: z.string().min(10, 'A senha deve ter pelo menos 10 caracteres.'),
    confirmarSenha: z.string().min(1, 'Confirme a senha.'),
  })
  .refine(({ senha, confirmarSenha }) => senha === confirmarSenha, {
    path: ['confirmarSenha'],
    message: 'As senhas informadas precisam ser iguais.',
  });

export type SenhaContaFormValues = z.infer<typeof senhaContaSchema>;

export const recuperarContaSchema = z.object({
  email: z.string().trim().min(1, 'Informe o email.').email('Email inválido.'),
});

export type RecuperarContaFormValues = z.infer<typeof recuperarContaSchema>;
