import { AdminShell } from '@/components/admin/admin-shell';
import { requireAccess } from '@/lib/auth/require';

/**
 * A área da plataforma. Nenhum papel de tenant alcança — nem o `owner`.
 *
 * O caminho é literal, e não lido de cabeçalho: ver `lib/auth/require.ts`. Um
 * `'/adminpanel'` escrito aqui não pode ser forjado por quem faz a requisição.
 *
 * O layout guarda a subárvore inteira, então uma página nova em `adminpanel/`
 * nasce protegida. É a mesma escolha de `matchRule`: esquecimento vira
 * negação, não vazamento.
 *
 * ## O que mudou na ADR-005, e o que não mudou
 *
 * **Mudou** onde isto mora — era `app/(app)/admin/`, dentro do route group do
 * cliente, e por isso herdava o `AppShell` inteiro: logo Tivexy dentro da
 * sidebar da empresa, seletor de empresa, sino de avisos do tenant. Agora é
 * route group próprio, com casca própria (`AdminShell`).
 *
 * **Não mudou** a proteção: é a mesma chamada, no mesmo lugar do ciclo, contra
 * a mesma regra — que segue sendo `superAdmin`, agora sob o prefixo
 * `/adminpanel`. E cada Server Action continua chamando `requireAccess` por
 * conta própria, porque Server Action é endpoint e a guarda do layout não roda
 * na chamada dela.
 *
 * O e-mail sai do contexto que `requireAccess` já devolve — não há uma segunda
 * leitura de sessão para o cabeçalho.
 */
export default async function AdminPanelLayout({ children }: LayoutProps<'/adminpanel'>) {
  const { email } = await requireAccess('/adminpanel');
  return <AdminShell email={email}>{children}</AdminShell>;
}
