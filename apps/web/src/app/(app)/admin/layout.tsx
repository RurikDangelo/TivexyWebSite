import { requireAccess } from '@/lib/auth/require';

/**
 * A área da plataforma. Nenhum papel de tenant alcança — nem o `owner`.
 *
 * O caminho é literal, e não lido de cabeçalho: ver `lib/auth/require.ts`. Um
 * `'/admin'` escrito aqui não pode ser forjado por quem faz a requisição.
 *
 * O layout guarda o subárvore inteiro, então uma página nova em `admin/` nasce
 * protegida. É a mesma escolha de `matchRule`: esquecimento vira negação, não
 * vazamento.
 */
export default async function AdminLayout({ children }: LayoutProps<'/admin'>) {
  await requireAccess('/admin');
  return children;
}
