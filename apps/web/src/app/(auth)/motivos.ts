/**
 * Por que o link do e-mail não virou sessão.
 *
 * Vive fora de `app/auth/callback/route.ts` porque o motivo tem dois donos: quem
 * o escreve na URL (o callback) e quem o lê e o transforma em frase (a tela de
 * entrada). Com a string literal repetida nos dois lados, renomear um motivo
 * deixa a tela muda e ninguém percebe — e o sintoma é exatamente o `/entrar` em
 * branco que este módulo existe para acabar.
 *
 * **Lista fechada, de propósito.** O valor chega pela URL, logo chega de fora.
 * `explicarMotivo()` só devolve frase para chave conhecida; qualquer outra coisa
 * vira `null` e a tela não mostra nada. Sem isso, `?motivo=` seria um lugar onde
 * um terceiro escolhe o texto que a Tivexy exibe para quem está prestes a
 * digitar a senha.
 */

/** Em português, como todo parâmetro de rota deste app. */
export const PARAM_MOTIVO = 'motivo';

export type MotivoDeFalha = 'link-invalido' | 'link-ausente' | 'sem-configuracao';

export interface Explicacao {
  texto: string;
  /** O próximo passo, quando existe um que resolva. */
  acao?: { rotulo: string; href: string };
}

/*
 * A cópia de `link-invalido` é a mesma de `definir-senha/page.tsx` de propósito:
 * é a mesma situação vista de dois pontos do fluxo, e duas redações dela fariam
 * a pessoa achar que são dois problemas diferentes.
 */
export const MOTIVOS: Record<MotivoDeFalha, Explicacao> = {
  'link-invalido': {
    texto: 'O link expirou ou já foi usado. Peça uma nova recuperação para continuar.',
    acao: { rotulo: 'Pedir um link novo', href: '/recuperar' },
  },
  'link-ausente': {
    texto:
      'Este endereço só funciona a partir do link que enviamos por e-mail. Abra o link direto do e-mail — ou entre aqui com e-mail e senha.',
  },
  'sem-configuracao': {
    texto:
      'Não consegui conferir o link agora: esta instalação está sem a configuração do banco. Avise quem administra a conta.',
  },
};

function ehMotivo(valor: string): valor is MotivoDeFalha {
  return Object.hasOwn(MOTIVOS, valor);
}

/** A explicação de um `?motivo=`, ou `null` quando o valor não é um dos nossos. */
export function explicarMotivo(bruto: string | string[] | undefined): Explicacao | null {
  /* Parâmetro repetido chega como lista; vale o primeiro, que é o que o navegador mostra. */
  const valor = Array.isArray(bruto) ? bruto[0] : bruto;
  if (typeof valor !== 'string' || !ehMotivo(valor)) return null;
  return MOTIVOS[valor];
}
