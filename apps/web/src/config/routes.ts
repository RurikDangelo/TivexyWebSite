import type { RouteMatcher } from '@tivexy/core';

/**
 * O que cada rota exige. Um lugar só — não espalhado por `page.tsx`.
 *
 * O que **não** está aqui fica fechado: `matchRule` devolve `member` quando
 * nada casa. Uma rota nova que alguém esqueceu de declarar fica protegida, e o
 * sintoma é um chamado — não um vazamento.
 *
 * A ordem da lista não importa: o prefixo mais específico vence.
 *
 * As permissões são tipadas como `PermissionCode`, então um código inventado
 * não compila. É o que impede esta lista de divergir do catálogo do banco.
 */
export const routeRules: readonly RouteMatcher[] = [
  /* Abertas — quem chega sem sessão precisa conseguir entrar. */
  { prefix: '/entrar', rule: { kind: 'public' } },
  { prefix: '/recuperar', rule: { kind: 'public' } },

  /*
   * Onde o link do e-mail vira sessão. Público porque quem clica ainda não
   * tem sessão — é justamente isto que vai criá-la.
   */
  { prefix: '/auth', rule: { kind: 'public' } },

  /*
   * A senha nova. Quem vem do link chega aqui já com sessão, mas quem chega
   * com o link vencido não tem nenhuma — e precisa ler o motivo em vez de ser
   * mandado para o login sem explicação.
   */
  { prefix: '/definir-senha', rule: { kind: 'public' } },

  /*
   * Saída do limbo. Exigem sessão, mas não vínculo ativo: é para cá que
   * `redirectFor` manda quem o `member` negou. Exigir mais criaria laço.
   */
  { prefix: '/convite', rule: { kind: 'authenticated' } },
  { prefix: '/onboarding', rule: { kind: 'authenticated' } },
  { prefix: '/preparando', rule: { kind: 'authenticated' } },
  { prefix: '/conta', rule: { kind: 'authenticated' } },
  /* Escolher entre as empresas de que participa. Quem chega aqui tem vínculo
     com mais de uma e ainda não escolheu qual — exigir empresa ativa seria o
     laço de sempre. */
  { prefix: '/empresas', rule: { kind: 'authenticated' } },
  { prefix: '/sair', rule: { kind: 'authenticated' } },

  /*
   * A página que explica a negação. `authenticated` de propósito, e não
   * `member`: quem chega aqui já foi negado uma vez, e negá-lo de novo na
   * página que existe para explicar a negação seria o pior laço possível.
   */
  { prefix: '/acesso-negado', rule: { kind: 'authenticated' } },

  /* Plataforma. Nenhum papel de tenant alcança. */
  { prefix: '/admin', rule: { kind: 'superAdmin' } },

  /* Operação do tenant. */
  { prefix: '/painel', rule: { kind: 'member' } },

  { prefix: '/crm/leads', rule: { kind: 'permission', permission: 'crm.leads.read' } },
  { prefix: '/crm/contatos', rule: { kind: 'permission', permission: 'crm.contacts.read' } },
  { prefix: '/crm/empresas', rule: { kind: 'permission', permission: 'crm.companies.read' } },
  { prefix: '/crm/oportunidades', rule: { kind: 'permission', permission: 'crm.deals.read' } },
  { prefix: '/crm/atividades', rule: { kind: 'permission', permission: 'crm.activities.read' } },

  { prefix: '/erp/produtos', rule: { kind: 'permission', permission: 'erp.products.read' } },
  { prefix: '/erp/vendas', rule: { kind: 'permission', permission: 'erp.sales.read' } },
  /* Registrar pede escrever: quem só consulta vendas não chega ao balcão. */
  { prefix: '/erp/vendas/nova', rule: { kind: 'permission', permission: 'erp.sales.write' } },
  { prefix: '/erp/estoque', rule: { kind: 'permission', permission: 'inventory.stock.read' } },
  { prefix: '/erp/financeiro', rule: { kind: 'permission', permission: 'finance.cashflow.read' } },

  { prefix: '/automacoes', rule: { kind: 'permission', permission: 'automation.rules.read' } },
  {
    prefix: '/integracoes',
    rule: { kind: 'permission', permission: 'integrations.connections.read' },
  },
  { prefix: '/equipe', rule: { kind: 'permission', permission: 'core.users.read' } },
  { prefix: '/configuracoes', rule: { kind: 'permission', permission: 'core.settings.read' } },
];
