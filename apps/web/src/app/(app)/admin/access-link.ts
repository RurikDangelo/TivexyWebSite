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
import { magicLinkFor } from '@/server/auth-links';

import type { AccessLinkState } from './state.ts';

export async function gerarLinkDeAcesso(form: FormData): Promise<AccessLinkState> {
  await requireAccess('/admin');

  const email = String(form.get('email') ?? '')
    .trim()
    .toLowerCase();
  if (email === '') return { erro: 'Sem e-mail para gerar o link.', link: null, email: null };

  const r = await magicLinkFor(email);
  return r.ok ? { erro: null, link: r.link, email } : { erro: r.erro, link: null, email: null };
}
