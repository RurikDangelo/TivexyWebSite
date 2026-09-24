/**
 * O estado da tela de atividades.
 *
 * Fora de `actions.ts` pela regra do Next: arquivo `'use server'` só exporta
 * função assíncrona. Ver `app/(auth)/form-state.ts`.
 */

/** Os campos que a conferência sabe apontar. */
export type CampoAtividade = 'subject' | 'alvo' | 'due_at';

export interface AtividadeFormState {
  erro: string | null;
  campos: Readonly<Partial<Record<CampoAtividade, string>>>;
  criado: string | null;
}

export const ATIVIDADE_INICIAL: AtividadeFormState = { erro: null, campos: {}, criado: null };

/**
 * Os quatro tipos de alvo, como o esquema os nomeia.
 *
 * A constraint `crm_activities_one_target` exige **exatamente uma** das quatro
 * colunas preenchida. Ter a lista aqui, em tempo de execução, é o que permite
 * o servidor decodificar a escolha da tela sem um `switch` escrito à mão em
 * cada lugar — e é o mesmo motivo de `CRM_LEAD_STATUSES` existir no Core.
 */
export const ALVOS = ['lead', 'contact', 'company', 'deal'] as const;

export type TipoDeAlvo = (typeof ALVOS)[number];

/** A coluna de cada tipo de alvo. */
export const COLUNA_DO_ALVO: Record<TipoDeAlvo, string> = {
  lead: 'lead_id',
  contact: 'contact_id',
  company: 'company_id',
  deal: 'deal_id',
};

/** Como cada tipo de alvo se chama no grupo do seletor. */
export const GRUPO_DO_ALVO: Record<TipoDeAlvo, string> = {
  lead: 'Leads',
  contact: 'Contatos',
  company: 'Empresas',
  deal: 'Oportunidades',
};

/** Uma opção de alvo, já com o tipo embutido no valor. */
export interface AlvoOferecido {
  /** `lead:<uuid>` — o tipo e o id juntos, porque a escolha é uma só. */
  valor: string;
  tipo: TipoDeAlvo;
  nome: string;
}

/** Uma atividade na agenda. */
export interface AtividadeListada {
  id: string;
  subject: string;
  notes: string | null;
  /** ISO, vindo de `timestamptz`. Quem interpreta é o fuso do tenant. */
  dueAt: string | null;
  doneAt: string | null;
  tipo: string | null;
  alvoTipo: TipoDeAlvo | null;
  alvoNome: string | null;
}
