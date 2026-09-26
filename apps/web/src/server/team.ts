import 'server-only';

/**
 * O que é preciso saber de uma conta antes de convidá-la.
 *
 * Por SQL, com a conexão de serviço, porque a pergunta atravessa empresas —
 * "essa conta tem vínculo em outra?" —, e o RLS, corretamente, não deixa quem
 * administra uma empresa enxergar a outra. A resposta sai daqui só como
 * contagem e booleano: nenhum nome de outra empresa chega à tela.
 */

import { sqlClient } from './db.ts';

export interface ContaExistente {
  userId: string;
  nuncaEntrou: boolean;
  outrasEmpresas: number;
  superAdmin: boolean;
  /** Já tem vínculo com **esta** empresa, e em que estado. */
  vinculoAqui: 'invited' | 'active' | 'suspended' | null;
}

export async function contaPorEmail(
  email: string,
  tenantId: string,
): Promise<ContaExistente | null> {
  const { rows } = await sqlClient().query(
    `select u.id,
            u.last_sign_in_at is null as nunca_entrou,
            coalesce(p.is_super_admin, false) as super_admin,
            (select count(*) from public.tenant_users tu
              where tu.user_id = u.id and tu.tenant_id <> $2)::int as outras,
            (select tu.status::text from public.tenant_users tu
              where tu.user_id = u.id and tu.tenant_id = $2) as aqui
       from auth.users u
       left join public.users p on p.id = u.id
      where lower(u.email) = lower($1)
      limit 1`,
    [email.trim(), tenantId],
  );
  const linha = rows[0];
  if (linha === undefined) return null;
  return {
    userId: String(linha.id),
    nuncaEntrou: linha.nunca_entrou === true,
    outrasEmpresas: Number(linha.outras),
    superAdmin: linha.super_admin === true,
    vinculoAqui: (linha.aqui as ContaExistente['vinculoAqui']) ?? null,
  };
}
