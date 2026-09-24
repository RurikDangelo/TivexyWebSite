'use server';

/**
 * Aceitar o convite.
 *
 * Quem faz o trabalho é `accept_invite()`, no banco, e precisa ser assim: o
 * RLS nega escrita em `tenant_users` a quem ainda não é membro ativo — que é
 * exatamente quem está nesta tela. A função é `SECURITY DEFINER` e estreita,
 * e confere quatro coisas antes de escrever. Ver a migration.
 *
 * **O tenant vem da sessão, não do formulário.** Poderia vir do formulário
 * sem abrir brecha — a função ignora qualquer usuário que não seja
 * `auth.uid()` —, mas aceitar do formulário deixaria a tela oferecer aceitar
 * um convite que ela não está mostrando. O que se vê e o que se aceita
 * precisam ser a mesma coisa.
 */

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { currentSession } from '@/lib/auth/session';
import { supabaseServer } from '@/lib/supabase/server';

import type { ConviteState } from './state.ts';

/*
 * A assinatura é a de `useActionState`: estado anterior e `FormData`. Nenhum
 * dos dois é lido, e por isso os nomes começam com `_` — o formulário não tem
 * campo, porque o tenant vem da sessão. Ler o `FormData` aqui seria aceitar
 * do navegador a escolha de qual convite ativar.
 */
export async function aceitarConvite(
  _anterior: ConviteState,
  _form: FormData,
): Promise<ConviteState> {
  const { choice } = await currentSession();

  /*
   * `currentSession` e não `requireAccess('/convite')`: a rota é
   * `authenticated`, e exigir vínculo ativo aqui negaria justamente quem veio
   * aceitar. É o laço que a própria página existe para quebrar.
   */
  if (choice.kind !== 'resolved') {
    return { erro: 'Não consegui identificar a empresa do convite. Abra o link de novo.' };
  }

  const supabase = await supabaseServer();
  const { error } = await supabase.rpc('accept_invite', { p_tenant_id: choice.tenant.id });

  if (error !== null) {
    /*
     * A função levanta mensagens escritas para gente — "este convite não está
     * mais válido". Repassar é melhor que um texto genérico; o que não se
     * repassa é erro de infraestrutura.
     */
    return { erro: error.message.replace(/^error:\s*/i, '') || 'Não consegui aceitar o convite.' };
  }

  /*
   * O `Viewer` da sessão é lido por requisição e acabou de mudar de
   * `invited` para `active`. Sem invalidar, a próxima página seria renderizada
   * com o contexto velho e mandaria a pessoa de volta para cá.
   */
  revalidatePath('/', 'layout');
  redirect('/painel');
}
