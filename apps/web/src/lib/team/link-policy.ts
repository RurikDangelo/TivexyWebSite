/**
 * Quando quem administra uma empresa pode receber o link de acesso de alguém.
 *
 * ## O link é credencial
 *
 * Quem abre o link entra **como aquela conta**. O Super Admin gera link para
 * qualquer conta, e isso é aceitável no nível da plataforma. Para quem
 * administra **uma** empresa, não é: se bastasse convidar um e-mail para
 * receber o link, convidar a diretora de outra empresa cliente entregaria o
 * login dela — com acesso a tudo que ela vê lá.
 *
 * Então o link só sai para conta que **ninguém usou** e que **não pertence a
 * nenhuma outra empresa**. Uma conta assim não tem nada a expor além deste
 * convite. Quem já tem conta recebe o convite e o vê em `/convite` ao entrar,
 * com a própria senha.
 *
 * Isto existe enquanto o convite não sai por e-mail (SMTP 🔒). Com e-mail, o
 * link vai para a caixa de quem foi convidado, e ninguém mais o vê.
 */

export interface ContaConvidada {
  /** A conta já existia antes deste convite. */
  jaExistia: boolean;
  /** Nunca entrou no sistema. */
  nuncaEntrou: boolean;
  /** Em quantas outras empresas ela tem vínculo, de qualquer estado. */
  outrasEmpresas: number;
  superAdmin: boolean;
}

export type DecisaoDoLink = { gerar: true } | { gerar: false; motivo: string };

export function decidirLink(conta: ContaConvidada): DecisaoDoLink {
  if (conta.superAdmin) {
    return { gerar: false, motivo: 'Esta conta é da equipe Tivexy.' };
  }
  if (conta.outrasEmpresas > 0) {
    return {
      gerar: false,
      motivo: 'Essa pessoa já usa o Tivexy em outra empresa. Ela verá o convite ao entrar.',
    };
  }
  if (!conta.nuncaEntrou) {
    return { gerar: false, motivo: 'Essa pessoa já tem acesso. Ela verá o convite ao entrar.' };
  }
  return { gerar: true };
}
