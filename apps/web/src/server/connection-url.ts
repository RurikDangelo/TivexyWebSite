/**
 * A string de conexão do Postgres, em forma que o driver aceita.
 *
 * As mesmas duas armadilhas que `scripts/db-url.mjs` resolve para o CLI, e pelo
 * mesmo motivo — as duas produzem **o mesmo erro**, que parece senha errada e
 * não é:
 *
 *   FATAL: password authentication failed for user "postgres"
 *
 * **1. O colchete que sobra.** O painel do Supabase entrega a string com
 * `[YOUR-PASSWORD]` no lugar da senha. Quem substitui só o miolo deixa o `]`
 * grudado no fim. Custou quatro tentativas de diagnóstico da primeira vez.
 *
 * **2. Caractere reservado.** A senha gerada costuma trazer `]`, `*`, `#` ou
 * `?`, que têm significado dentro de uma URL. Sem percent-encoding, o servidor
 * recebe a senha truncada no primeiro deles.
 *
 * ## Por que isto existe duas vezes no repositório
 *
 * `scripts/db-url.mjs` roda na raiz, lê o `.env` do disco e não pode importar
 * de `apps/`. Este arquivo roda dentro do app, lê `process.env` — que em
 * produção vem da Vercel, onde `.env` não existe — e não pode importar de
 * `scripts/`: a direção de dependência permitida é `apps/* → packages/*`.
 *
 * O percent-encoding é sempre aplicado, e a senha é sempre lida como crua.
 * Adivinhar se ela já veio codificada seria pior: `Ab%3Fxy` é senha legítima e
 * indistinguível de `Ab?xy` já codificado. A regra está em `.env.example`, e o
 * teste a fixa para que não mude por acidente.
 *
 * Mover a regra para `packages/core` resolveria a duplicação e quebraria o que
 * aquele pacote é: contratos puros, "nada de acesso a banco". Entre duplicar
 * seis linhas com teste dos dois lados e abrir uma exceção na fronteira, a
 * duplicação custa menos. Se uma das duas mudar, a outra precisa mudar junto.
 */

/** Uma senha com o marcador do painel pela metade, sem o colchete de fecho. */
function semColchete(senha: string): string {
  return senha.replace(/^\[/, '').replace(/\]$/, '');
}

export class ConnectionUrlError extends Error {}

/**
 * Normaliza a URL, ou explica o que está errado.
 *
 * Lança em vez de devolver a entrada intacta: uma URL malformada aqui viraria
 * `password authentication failed` lá na frente, e essa mensagem não leva
 * ninguém até a causa.
 */
export function normalizeConnectionUrl(bruta: string, nomeDaVariavel: string): string {
  const valor = bruta.trim().replace(/^["']|["']$/g, '');

  /*
   * A senha vai até o **último** `@`, não até o primeiro.
   *
   * `[^@]*` pararia no primeiro, e uma senha com `@` dentro seria cortada ali:
   * o resto viraria parte do host, e o erro de novo seria "senha incorreta".
   * O host não pode conter `@`, então o último é sempre o separador.
   */
  const partes = valor.match(/^(postgres(?:ql)?:\/\/[^:@]+:)(.*)(@[^@]+)$/);
  if (partes === null) {
    throw new ConnectionUrlError(
      `${nomeDaVariavel} não tem a forma postgresql://usuario:senha@host:porta/banco`,
    );
  }

  const [, inicio, senhaBruta, fim] = partes;
  const senha = semColchete(senhaBruta ?? '');

  if (senha === '' || /^YOUR[-_]?PASSWORD$/i.test(senha)) {
    throw new ConnectionUrlError(
      `${nomeDaVariavel} ainda tem o marcador de senha do painel. Troque ` +
        '[YOUR-PASSWORD] inteiro — colchetes inclusive — pela senha real do banco.',
    );
  }

  return `${inicio}${encodeURIComponent(senha)}${fim}`;
}
