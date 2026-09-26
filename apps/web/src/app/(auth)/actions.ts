'use server';

/**
 * As ações das telas de entrada.
 *
 * Server Actions e não Route Handlers: o formulário funciona sem JavaScript, e
 * a senha nunca aparece numa URL nem num `fetch` que alguma extensão possa ler.
 *
 * ## Não dizer quem existe
 *
 * Duas regras aqui, e as duas são sobre **enumeração de contas** — descobrir
 * quais e-mails têm conta, mandando um por um e lendo a diferença na resposta.
 * É o primeiro passo de quem vai tentar senha em massa depois.
 *
 *   entrar()     erro de credencial é sempre o mesmo texto. "Senha incorreta"
 *                confirmaria o e-mail; "e-mail não encontrado" também.
 *   recuperar()  responde a mesma coisa sempre, tenha o endereço conta ou não.
 *
 * ## O destino depois do login
 *
 * Vem da URL, então vem de fora. `parseReturnTo()` já existe e já tem teste
 * contra redirecionamento aberto — usar outra validação aqui seria manter duas,
 * e a segunda é a que erra.
 */

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { parseReturnTo } from '@/lib/auth/guard';
import { conferirSenhaNova } from '@/lib/auth/password';
import { supabaseServer } from '@/lib/supabase/server';

import type { FormState } from './form-state.ts';

/** Para onde ir depois de entrar, quando nada foi pedido. */
const DESTINO_PADRAO = '/painel';

/** Para onde o link de recuperação leva depois de virar sessão. */
const DESTINO_SENHA = '/definir-senha';

function texto(form: FormData, campo: string): string {
  const valor = form.get(campo);
  return typeof valor === 'string' ? valor.trim() : '';
}

/**
 * Traduz o erro do Supabase.
 *
 * `email_not_confirmed` é o único caso específico, e a escolha é deliberada:
 * ele também revela que a conta existe, mas a API do Supabase já devolve esse
 * código para qualquer um que chame direto — esconder na nossa tela não fecha
 * o vazamento, só deixa a pessoa presa sem saber o que fazer.
 */
function mensagemDe(codigo: string | undefined, status: number | undefined): string {
  if (codigo === 'email_not_confirmed') {
    return 'Sua conta ainda não foi confirmada. Procure o e-mail de confirmação que enviamos.';
  }
  if (codigo === 'over_request_rate_limit' || status === 429) {
    return 'Muitas tentativas em pouco tempo. Espere alguns minutos e tente de novo.';
  }
  return 'E-mail ou senha incorretos.';
}

export async function entrar(_anterior: FormState, form: FormData): Promise<FormState> {
  const email = texto(form, 'email');
  const senha = texto(form, 'senha');

  if (email === '' || senha === '') {
    return { erro: 'Preencha e-mail e senha.' };
  }

  let supabase: Awaited<ReturnType<typeof supabaseServer>>;
  try {
    supabase = await supabaseServer();
  } catch (erro) {
    /* Configuração ausente. A mensagem de `lib/env.ts` nomeia a variável. */
    return { erro: erro instanceof Error ? erro.message : 'Supabase não configurado.' };
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password: senha });

  if (error !== null) {
    return { erro: mensagemDe(error.code, error.status) };
  }

  redirect(parseReturnTo(texto(form, 'proxima')) ?? DESTINO_PADRAO);
}

/**
 * O endereço de retorno do e-mail, montado do host desta requisição.
 *
 * O `Host` vem do navegador, então em tese é escolhido por quem pede. Duas
 * coisas o contêm: a Vercel recusa host que não seja do projeto, e o Supabase
 * só redireciona para URLs da lista de permitidas do projeto. Um valor forjado
 * aqui não vira link para fora — vira um e-mail que não chega a sair.
 */
async function destinoDoLink(): Promise<string | undefined> {
  const cabecalhos = await headers();
  const host = cabecalhos.get('host');
  if (host === null) return undefined;
  const protocolo =
    cabecalhos.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${protocolo}://${host}/auth/callback?destino=${encodeURIComponent(DESTINO_SENHA)}`;
}

/**
 * Pede o e-mail de recuperação.
 *
 * Responde a mesma coisa em todos os casos — inclusive quando o endereço não
 * tem conta. Um erro diferente aqui seria a própria enumeração, entregue pela
 * tela que existe para ajudar.
 */
export async function recuperar(_anterior: FormState, form: FormData): Promise<FormState> {
  const email = texto(form, 'email');
  if (email === '') return { erro: 'Informe o e-mail da sua conta.' };

  const confirmacao: FormState = {
    erro: null,
    aviso: `Se houver uma conta para ${email}, o link de recuperação chega em instantes. Confira também a caixa de spam.`,
  };

  try {
    const supabase = await supabaseServer();
    await supabase.auth.resetPasswordForEmail(email, { redirectTo: await destinoDoLink() });
  } catch {
    /* Silêncio de propósito: ver o cabeçalho. */
  }

  return confirmacao;
}

/**
 * Grava a senha nova, depois do link de recuperação ou do convite.
 *
 * Exige sessão — e tem: o link de recuperação passa por `/auth/callback`, que
 * troca o código por uma sessão antes de trazer a pessoa para cá. Sem isso,
 * qualquer um trocaria a senha de qualquer conta.
 */
export async function definirSenha(_anterior: FormState, form: FormData): Promise<FormState> {
  const senha = texto(form, 'senha');
  const confirmacao = texto(form, 'confirmacao');

  const problema = conferirSenhaNova(senha, confirmacao);
  if (problema !== null) return { erro: problema };

  const supabase = await supabaseServer();

  const { data } = await supabase.auth.getUser();
  if (data.user === null) {
    return { erro: 'O link expirou. Peça uma nova recuperação para continuar.' };
  }

  const { error } = await supabase.auth.updateUser({ password: senha });
  if (error !== null) {
    return {
      erro:
        error.code === 'same_password'
          ? 'Escolha uma senha diferente da atual.'
          : 'Não consegui gravar a senha nova. Tente de novo em instantes.',
    };
  }

  redirect(DESTINO_PADRAO);
}

/** Encerra a sessão. */
export async function sair(): Promise<never> {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  redirect('/entrar');
}

/**
 * Encerra a sessão **em todos os aparelhos**.
 *
 * `scope: 'global'` revoga os tokens de renovação de toda sessão desta conta.
 * É o que se faz depois de esquecer o login aberto num computador que não é
 * seu — ou ao desconfiar de que alguém mais tem a senha.
 */
export async function sairDeTodos(): Promise<never> {
  const supabase = await supabaseServer();
  await supabase.auth.signOut({ scope: 'global' });
  redirect('/entrar');
}
