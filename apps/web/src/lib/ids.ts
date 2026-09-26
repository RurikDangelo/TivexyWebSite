/**
 * Identificadores que chegam de fora — formulário, endereço, arrastar e soltar.
 *
 * Conferir o formato antes de consultar não é segurança (o banco recusaria),
 * é a diferença entre "não encontrado" e um erro 500 com `invalid input
 * syntax for type uuid` no log.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(valor: unknown): valor is string {
  return typeof valor === 'string' && UUID.test(valor);
}

/** Lê um campo de texto de um formulário, aparado. Ausente vira `''`. */
export function campo(form: FormData, nome: string): string {
  const valor = form.get(nome);
  return typeof valor === 'string' ? valor.trim() : '';
}

/** Como `campo`, mas vazio vira `null` — coluna opcional, não "preenchida com nada". */
export function opcional(form: FormData, nome: string): string | null {
  const valor = campo(form, nome);
  return valor === '' ? null : valor;
}

/** Um id opcional: vazio é `null`, e formato torto também — o banco não vai recebê-lo. */
export function idOpcional(form: FormData, nome: string): string | null {
  const valor = campo(form, nome);
  return isUuid(valor) ? valor : null;
}
