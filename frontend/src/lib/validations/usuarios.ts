import { z } from 'zod';

/** Schemas de VALIDAÇÃO de form (React Hook Form + zodResolver) -- mesmo
 * padrão de `validations/monitoramento.ts`. Senha mínima de 10 caracteres
 * espelha a mesma regra do backend (`schemas.py::_validar_senha`,
 * `scripts/criar_usuario.py`). */

const roleSchema = z.enum(['admin', 'colaborador', 'leitor'], { message: 'Selecione um perfil.' });

export const criarUsuarioSchema = z.object({
  name: z.string().trim().min(1, 'Informe o nome.'),
  email: z.string().trim().min(1, 'Informe o email.').email('Email inválido.'),
  role: roleSchema,
});
export type CriarUsuarioFormValues = z.infer<typeof criarUsuarioSchema>;

export const editarUsuarioSchema = z.object({
  name: z.string().trim().min(1, 'Informe o nome.'),
  role: roleSchema,
});
export type EditarUsuarioFormValues = z.infer<typeof editarUsuarioSchema>;
