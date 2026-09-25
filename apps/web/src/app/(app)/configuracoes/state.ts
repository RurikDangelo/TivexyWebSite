/** Estado dos formulários de configurações. Fora de `actions.ts`: ver a regra do Next. */
export interface ConfigState {
  erro: string | null;
  /** Problemas por campo — a chave é o nome do campo no formulário. */
  campos: Readonly<Record<string, string>>;
  ok: string | null;
}

export const CONFIG_INICIAL: ConfigState = { erro: null, campos: {}, ok: null };
