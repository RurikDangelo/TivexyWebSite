/**
 * O código de uma relação embutida do PostgREST.
 *
 * `select('plans(code)')` devolve **objeto** quando a relação é para-um e
 * **lista** quando é para-muitos. Sem os tipos gerados do banco, o cliente do
 * Supabase não sabe qual das duas é e tipa como lista — então um `as` para
 * objeto compila e quebra em tempo de execução, ou o contrário.
 *
 * Em vez de apostar, esta função aceita as duas formas. Quando
 * `database.types.ts` existir, a inferência acerta sozinha e isto vira uma
 * checagem inócua — mas continua correta.
 */
export function embeddedCode(valor: unknown): string | null {
  const alvo = Array.isArray(valor) ? valor[0] : valor;
  if (alvo === null || typeof alvo !== 'object') return null;
  const code = (alvo as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}
