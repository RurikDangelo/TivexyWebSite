'use server';

/**
 * As escritas da própria conta.
 *
 * Nenhuma recebe de quem é a conta: é sempre a da sessão. O RLS de `users` só
 * deixa cada um editar a própria linha, e o privilégio de coluna só deixa
 * `full_name`, `avatar_url` e `last_seen_at` — e-mail e Super Admin estão fora.
 */

import { revalidatePath } from 'next/cache';

import { requireAccess } from '@/lib/auth/require';
import { conferirSenhaNova } from '@/lib/auth/password';
import { campo } from '@/lib/ids';
import { supabaseServer } from '@/lib/supabase/server';

import { CONTA_INICIAL, type ContaState } from './state';

export async function salvarPerfil(_a: ContaState, form: FormData): Promise<ContaState> {
  const { viewer } = await requireAccess('/conta');
  const nome = campo(form, 'nome');
  if (nome === '') return { ...CONTA_INICIAL, campos: { nome: 'Obrigatório.' } };
  if (nome.length > 120) return { ...CONTA_INICIAL, campos: { nome: 'No máximo 120 caracteres.' } };

  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from('users')
    .update({ full_name: nome })
    .eq('id', viewer.userId ?? '')
    .select('id');

  if (error !== null || data.length === 0) {
    return { ...CONTA_INICIAL, erro: 'Não consegui salvar o nome agora. Tente de novo.' };
  }
  revalidatePath('/', 'layout');
  return { ...CONTA_INICIAL, ok: 'Nome salvo.' };
}

/**
 * Troca a senha, pedindo a atual.
 *
 * A sessão sozinha não basta: quem esqueceu o sistema aberto num computador
 * que não é seu entregaria a conta a quem sentasse depois. Conferir a senha
 * atual é o mínimo — e é por entrar de novo com ela, porque o Supabase não
 * tem "confira esta senha" sem abrir sessão. O `reauthenticate` que ele tem
 * manda um código por e-mail, e e-mail ainda não sai.
 */
export async function trocarSenha(_a: ContaState, form: FormData): Promise<ContaState> {
  await requireAccess('/conta');
  const atual = campo(form, 'atual');
  const nova = campo(form, 'nova');
  const confirmacao = campo(form, 'confirmacao');

  if (atual === '') return { ...CONTA_INICIAL, campos: { atual: 'Informe a senha atual.' } };
  const problema = conferirSenhaNova(nova, confirmacao);
  if (problema !== null) return { ...CONTA_INICIAL, campos: { nova: problema } };

  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  const email = data.user?.email;
  if (typeof email !== 'string') {
    return { ...CONTA_INICIAL, erro: 'Sua sessão terminou. Entre de novo para trocar a senha.' };
  }

  const conferida = await supabase.auth.signInWithPassword({ email, password: atual });
  if (conferida.error !== null) {
    return conferida.error.status === 429
      ? { ...CONTA_INICIAL, erro: 'Muitas tentativas em pouco tempo. Espere alguns minutos.' }
      : { ...CONTA_INICIAL, campos: { atual: 'Senha atual incorreta.' } };
  }

  const { error } = await supabase.auth.updateUser({ password: nova });
  if (error !== null) {
    return error.code === 'same_password'
      ? { ...CONTA_INICIAL, campos: { nova: 'Escolha uma senha diferente da atual.' } }
      : { ...CONTA_INICIAL, erro: 'Não consegui gravar a senha nova. Tente de novo em instantes.' };
  }
  return {
    ...CONTA_INICIAL,
    ok: 'Senha trocada. As outras sessões continuam abertas até você sair delas.',
  };
}
