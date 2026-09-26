/**
 * A regra da senha nova — uma só, para definir e para trocar.
 *
 * Duas telas escrevem senha. Com a regra em cada uma, a segunda é a que
 * aceita a senha de 6 caracteres que a primeira recusava.
 */

export const SENHA_MINIMA = 8;

export function conferirSenhaNova(senha: string, confirmacao: string): string | null {
  if (senha.length < SENHA_MINIMA) {
    return `A senha precisa ter ao menos ${SENHA_MINIMA} caracteres.`;
  }
  if (senha !== confirmacao) return 'As duas senhas não são iguais.';
  return null;
}
