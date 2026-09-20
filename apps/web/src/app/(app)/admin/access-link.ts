'use server';

/**
 * O link de acesso de quem foi convidado, gerado sem enviar e-mail.
 *
 * Existe porque a entrega ainda não existe. Criar a conta não precisa de SMTP;
 * **entregar o convite precisa**, e o projeto Supabase ainda usa o servidor
 * embutido, que só escreve para membros da equipe e para poucas mensagens por
 * hora. Enquanto isso, quem provisiona repassa o link pelo canal que já usa com
 * o cliente.
 *
 * A alternativa seria a tela dizer "enviamos um e-mail" e nenhum e-mail sair.
 * É exatamente o tipo de funcionalidade fingida que este repositório proíbe.
 *
 * `generate_link` devolve o mesmo link que o e-mail carregaria, sem disparar
 * nada. Quando houver SMTP próprio, o envio volta para dentro da etapa
 * `send_invite` e esta tela vira o caminho de exceção — "o cliente não recebeu,
 * me dá o link de novo" —, que continua fazendo falta.
 *
 * > O link **é credencial**: quem o abrir entra como aquela conta. Vale uma vez
 * > e vence. Por isso ele não é gravado em lugar nenhum, não entra em log e só
 * > aparece para quem já podia criar a conta.
 */

import { requireAccess } from '@/lib/auth/require';
import { requireSecretKey, requireSupabaseConfig } from '@/lib/env';

import type { AccessLinkState } from './state.ts';

export async function gerarLinkDeAcesso(form: FormData): Promise<AccessLinkState> {
  await requireAccess('/admin');

  const email = String(form.get('email') ?? '')
    .trim()
    .toLowerCase();
  if (email === '') return { erro: 'Sem e-mail para gerar o link.', link: null, email: null };

  const { url } = requireSupabaseConfig();
  const chave = requireSecretKey();

  /*
   * `fetch` direto em vez do SDK: `generateLink` não está exposto no cliente
   * JavaScript do Supabase com este formato de retorno, e o endpoint é estável.
   */
  const resposta = await fetch(`${url}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: {
      apikey: chave,
      Authorization: `Bearer ${chave}`,
      'Content-Type': 'application/json',
    },
    /*
     * `magiclink`, e não `invite`: o convite recusa quem já existe, e a conta
     * foi criada na etapa `create_admin`. Os dois levam ao mesmo lugar — uma
     * sessão para a pessoa escolher a senha.
     */
    body: JSON.stringify({ type: 'magiclink', email }),
  });

  if (!resposta.ok) {
    return {
      erro: `O Supabase recusou gerar o link (${resposta.status}). Confira se a conta existe.`,
      link: null,
      email: null,
    };
  }

  const corpo = (await resposta.json()) as { action_link?: unknown };
  const link = typeof corpo.action_link === 'string' ? corpo.action_link : null;

  return link === null
    ? { erro: 'O Supabase respondeu sem link.', link: null, email: null }
    : { erro: null, link, email };
}
