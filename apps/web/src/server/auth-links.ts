import 'server-only';

/**
 * O link de acesso de uma conta, gerado sem enviar e-mail.
 *
 * `generate_link` devolve o mesmo link que o e-mail carregaria, sem disparar
 * nada. **O link é credencial**: quem o abrir entra como aquela conta. Não é
 * gravado, não entra em log, e quem chama decide se pode — ver
 * `lib/team/link-policy.ts` e o Super Admin.
 *
 * `magiclink`, e não `invite`: o convite recusa quem já existe, e a conta já
 * foi criada antes. Os dois levam ao mesmo lugar — uma sessão para a pessoa
 * escolher a senha.
 *
 * `fetch` direto em vez do SDK: `generateLink` não está exposto no cliente
 * JavaScript com este formato de retorno, e o endpoint é estável.
 */

import { requireSecretKey, requireSupabaseConfig } from '../lib/env.ts';

export type LinkResult = { ok: true; link: string } | { ok: false; erro: string };

export async function magicLinkFor(email: string): Promise<LinkResult> {
  const { url } = requireSupabaseConfig();
  const chave = requireSecretKey();

  const resposta = await fetch(`${url}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: {
      apikey: chave,
      Authorization: `Bearer ${chave}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ type: 'magiclink', email: email.trim().toLowerCase() }),
  });

  if (!resposta.ok) {
    return {
      ok: false,
      erro: `O Supabase recusou gerar o link (${resposta.status}). Confira se a conta existe.`,
    };
  }

  const corpo = (await resposta.json()) as { action_link?: unknown };
  return typeof corpo.action_link === 'string'
    ? { ok: true, link: corpo.action_link }
    : { ok: false, erro: 'O Supabase respondeu sem link.' };
}
