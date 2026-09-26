import { redirect } from 'next/navigation';

import { currentSession } from '@/lib/auth/session';

/**
 * A raiz decide, em vez de chutar.
 *
 * Antes mandava todo mundo para `/painel`, com um comentário que dizia que a
 * autenticação ainda não existia. Ela existe desde que `(auth)/entrar` nasceu, e
 * o efeito era este: quem digitava o domínio fazia `/` → `/painel` → a guarda
 * nega → `/entrar?proxima=%2Fpainel`. Dois redirecionamentos, dois flashes de
 * página em branco numa conexão ruim, e um parâmetro de lixo na barra de
 * endereços antes da primeira tela — tudo para descobrir o que a sessão já sabia.
 *
 * Aqui não há decisão de acesso nenhuma: a pergunta é só "tem sessão?". Quem
 * decide o que esta pessoa pode ver continua sendo `requireAccess()` no layout
 * de `(app)`, e o RLS depois dele. Mandar para `/painel` não concede nada.
 */
export default async function Home() {
  const { viewer } = await currentSession();
  redirect(viewer.userId === null ? '/entrar' : '/painel');
}
