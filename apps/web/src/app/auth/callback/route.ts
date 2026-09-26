/**
 * Onde o link do e-mail vira sessão.
 *
 * Convite, confirmação de conta e recuperação de senha terminam todos aqui. O
 * que chega é um código de uso único; o que sai é um cookie de sessão e um
 * redirecionamento para a tela certa.
 *
 * **Duas formas, porque os modelos de e-mail do Supabase usam as duas.** O
 * modelo padrão manda `?code=`, que é PKCE; um modelo ajustado à mão manda
 * `?token_hash=&type=`. Aceitar só uma significa que trocar o texto do e-mail
 * um dia quebra o convite — e o sintoma aparece no cliente, não aqui.
 *
 * O destino vem da URL, então passa por `parseReturnTo()`. Sem isso, um link
 * `…/auth/callback?destino=https://golpe.example` faria a Tivexy despachar
 * para o site do atacante **alguém que acabou de autenticar** — com sessão
 * válida e confiança no domínio.
 *
 * ## Falhar dizendo por quê
 *
 * Todo caminho de falha mandava para um `/entrar` limpo, sem parâmetro e sem
 * mensagem. Quem clicava num convite vencido, ou abria o e-mail duas vezes,
 * caía num formulário em branco e concluía que a senha estava errada. A lógica
 * de autenticação abaixo não mudou: o que mudou é que o redirecionamento leva
 * junto o nome da falha, e `/entrar` sabe traduzi-lo (ver `(auth)/motivos.ts`).
 */

import { type EmailOtpType } from '@supabase/supabase-js';
import { type NextRequest, NextResponse } from 'next/server';

import { type MotivoDeFalha, PARAM_MOTIVO } from '@/app/(auth)/motivos';
import { parseReturnTo } from '@/lib/auth/guard';
import { supabaseServer } from '@/lib/supabase/server';

const DESTINO_PADRAO = '/painel';

/** Os tipos que o Supabase envia por link de e-mail. */
const TIPOS: readonly EmailOtpType[] = [
  'signup',
  'invite',
  'magiclink',
  'recovery',
  'email_change',
];

function ehTipo(valor: string | null): valor is EmailOtpType {
  return valor !== null && (TIPOS as readonly string[]).includes(valor);
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  /*
   * Clonar a URL da requisição, em vez de montar a partir de `request.url`:
   * atrás do proxy da Vercel, `request.url` pode trazer o host interno, e o
   * redirecionamento levaria para um endereço que o navegador não alcança.
   */
  const destino = request.nextUrl.clone();
  destino.search = '';
  destino.pathname = parseReturnTo(searchParams.get('destino')) ?? DESTINO_PADRAO;

  /*
   * O endereço de falha é montado por motivo, e não uma vez: o parâmetro tem de
   * ser o da falha que realmente aconteceu. Nada do código original vai junto —
   * `token_hash` numa URL que fica no histórico do navegador é o oposto de
   * "código de uso único".
   */
  /* Sem tipo de retorno anotado: `clone()` devolve `NextURL`, que não é um `URL`. */
  function comFalha(motivo: MotivoDeFalha) {
    const falha = request.nextUrl.clone();
    falha.search = '';
    falha.pathname = '/entrar';
    falha.searchParams.set(PARAM_MOTIVO, motivo);
    return falha;
  }

  let supabase: Awaited<ReturnType<typeof supabaseServer>>;
  try {
    supabase = await supabaseServer();
  } catch {
    return NextResponse.redirect(comFalha('sem-configuracao'));
  }

  const code = searchParams.get('code');
  if (code !== null) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    return NextResponse.redirect(error === null ? destino : comFalha('link-invalido'));
  }

  const tokenHash = searchParams.get('token_hash');
  const tipo = searchParams.get('type');
  if (tokenHash !== null && ehTipo(tipo)) {
    const { error } = await supabase.auth.verifyOtp({ type: tipo, token_hash: tokenHash });
    return NextResponse.redirect(error === null ? destino : comFalha('link-invalido'));
  }

  /* Sem código nenhum: alguém abriu o endereço a seco. */
  return NextResponse.redirect(comFalha('link-ausente'));
}
