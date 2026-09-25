/**
 * O menu: o que aparece, para quem, e com que nome.
 *
 * Nasceu de um defeito visto ao abrir o sistema, não em teste: para a clínica
 * odontológica, a página dizia "Interessados" e o menu, "Leads". Nenhum teste
 * comparava as duas superfícies, e é o que os primeiros abaixo fazem — com os
 * blueprints de verdade, não com um vocabulário inventado para o teste.
 *
 *   npm run test:web
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ANONYMOUS,
  type ModuleCode,
  type PermissionCode,
  type Viewer,
  matchRule,
} from '@tivexy/core';
import { BLUEPRINTS } from '@tivexy/core/blueprints';

import { capitalizar } from '../lib/terms/vocabulary.ts';
import {
  type NavHref,
  labelOf,
  navItems as itens,
  sectionTitle,
  visibleNavigation,
} from './navigation.ts';
import { routeRules } from './routes.ts';

/** O recurso que a rota lista, lido da permissão que ela exige. */
function recursoDaRota(href: string): string | null {
  const regra = matchRule(routeRules, href);
  return regra.kind === 'permission' ? regra.permission.split('.').slice(0, 2).join('.') : null;
}

/*
 * Seções que não listam um recurso só, e por isso não seguem o nome do nicho.
 * Um item novo precisa declarar `term` ou entrar aqui, com o motivo — esquecer
 * deixa de ser possível, que é o que aconteceu com o menu inteiro.
 */
const SEM_RECURSO: Readonly<Record<string, string>> = {
  '/painel': 'resumo do negócio, não uma lista',
  '/erp/financeiro': 'junta contas a receber, a pagar e o fluxo de caixa',
  '/equipe': 'nome da seção, não do recurso — "Equipe" continua certo para qualquer nicho',
  '/configuracoes': 'nome da seção',
  '/admin': 'área da plataforma, fora do tenant',
};

function viewer(
  parcial: Partial<Viewer> & { modulos?: ModuleCode[]; permissoes?: PermissionCode[] },
): Viewer {
  const { modulos = [], permissoes = [], ...resto } = parcial;
  return {
    userId: '00000000-0000-4000-8000-000000000001',
    isSuperAdmin: false,
    tenant: { id: '00000000-0000-4000-8000-0000000000aa', status: 'active' },
    membershipStatus: 'active',
    permissions: new Set(permissoes),
    enabledModules: new Set(modulos),
    ...resto,
  };
}

const hrefsVisiveis = (v: Viewer) =>
  visibleNavigation(v, {}).flatMap((g) => g.items.map((i) => i.href));

describe('o menu fala a língua do nicho', () => {
  it('a clínica lê "Interessados" no menu, como na página', () => {
    const clinica = BLUEPRINTS.find((b) => b.code === 'clinica-odontologica');
    assert.ok(clinica, 'o blueprint da clínica sumiu do registro');
    assert.equal(sectionTitle(clinica.terms, '/crm/leads'), 'Interessados');
  });

  it('todo nome que um blueprint real dá a um recurso do menu chega no menu', () => {
    for (const blueprint of BLUEPRINTS) {
      for (const item of itens) {
        if (item.term === undefined) continue;
        const escolhido = blueprint.terms[item.term];
        if (escolhido === undefined) continue;
        assert.equal(
          labelOf(item, blueprint.terms),
          capitalizar(escolhido.plural),
          `${blueprint.code}: ${item.href}`,
        );
      }
    }
  });

  it('sem escolha do nicho, fica o rótulo curto do menu', () => {
    for (const item of itens) assert.equal(labelOf(item, {}), item.label, item.href);
  });

  it('título da página e rótulo do menu são a mesma função', () => {
    const cafeteria = BLUEPRINTS.find((b) => b.code === 'cafeteria');
    assert.ok(cafeteria);
    for (const item of itens) {
      assert.equal(
        sectionTitle(cafeteria.terms, item.href as NavHref),
        labelOf(item, cafeteria.terms),
        item.href,
      );
    }
    /* O exemplo que mostra por que o menu não usa o nome do recurso quando o nicho não escolhe. */
    assert.equal(sectionTitle(cafeteria.terms, '/erp/estoque'), 'Insumos');
    assert.equal(sectionTitle({}, '/erp/estoque'), 'Estoque');
  });
});

describe('todo item sabe qual recurso lista', () => {
  it('o termo do item é o recurso da permissão que a rota exige', () => {
    for (const item of itens) {
      if (item.term === undefined) continue;
      assert.equal(recursoDaRota(item.href), item.term, item.href);
    }
  });

  it('item sem termo precisa estar na lista de seções, com motivo', () => {
    const esquecidos = itens
      .filter((item) => item.term === undefined && !(item.href in SEM_RECURSO))
      .map((item) => item.href);
    assert.deepEqual(esquecidos, [], 'declare `term` no item ou explique em SEM_RECURSO');
  });

  it('a lista de seções não guarda item que já tem termo', () => {
    for (const href of Object.keys(SEM_RECURSO)) {
      const item = itens.find((i) => i.href === href);
      assert.ok(item, `${href} não está mais no menu`);
      assert.equal(item.term, undefined, `${href} tem termo e não precisa de exceção`);
    }
  });
});

describe('quem vê o quê', () => {
  it('sem sessão, nada', () => {
    assert.deepEqual(visibleNavigation(ANONYMOUS, {}), []);
  });

  it('a cafeteria não vê CRM — o módulo não foi contratado', () => {
    const barista = viewer({
      modulos: ['core', 'erp', 'inventory', 'finance'],
      permissoes: ['erp.products.read', 'erp.sales.read', 'crm.leads.read'],
    });
    const hrefs = hrefsVisiveis(barista);
    assert.ok(hrefs.includes('/erp/produtos'));
    assert.ok(!hrefs.some((h) => h.startsWith('/crm/')), `apareceu: ${hrefs.join(', ')}`);
  });

  it('sem a permissão, o item some — não aparece para mandar à página de acesso negado', () => {
    const recepcao = viewer({
      modulos: ['core', 'crm', 'finance'],
      permissoes: ['crm.contacts.read', 'crm.leads.read'],
    });
    const hrefs = hrefsVisiveis(recepcao);
    assert.ok(hrefs.includes('/crm/leads'));
    assert.ok(!hrefs.includes('/crm/oportunidades'));
    assert.ok(!hrefs.includes('/erp/financeiro'));
  });

  it('grupo sem nenhum item visível não aparece nem como cabeçalho', () => {
    const recepcao = viewer({ modulos: ['core', 'crm'], permissoes: ['crm.leads.read'] });
    const grupos = visibleNavigation(recepcao, {}).map((g) => g.label);
    assert.ok(!grupos.includes('ERP'));
    for (const grupo of visibleNavigation(recepcao, {})) assert.ok(grupo.items.length > 0);
  });

  it('o grupo de administração não existe para quem não é Super Admin', () => {
    /* Nem com todas as permissões de tenant: nenhum papel de tenant alcança a plataforma. */
    const dono = viewer({
      modulos: ['core', 'crm', 'erp', 'inventory', 'finance', 'automation', 'integrations'],
      permissoes: itens.flatMap((i) => {
        const r = matchRule(routeRules, i.href);
        return r.kind === 'permission' ? [r.permission] : [];
      }),
    });
    const grupos = visibleNavigation(dono, {}).map((g) => g.label);
    assert.ok(!grupos.includes('Administração'));
    assert.ok(!hrefsVisiveis(dono).includes('/admin'));
  });

  it('Super Admin sem empresa escolhida vê a plataforma, e não a operação', () => {
    /*
     * `decideAccess` deixaria o Super Admin abrir `/crm/leads`, mas sem
     * empresa a página não tem de quem mostrar dado. Oferecer o item seria
     * oferecer uma tela vazia.
     */
    const plataforma = viewer({ isSuperAdmin: true, tenant: null, membershipStatus: null });
    assert.deepEqual(hrefsVisiveis(plataforma), ['/admin']);
  });

  it('convite pendente não vê item nenhum da operação', () => {
    const convidado = viewer({
      membershipStatus: 'invited',
      modulos: ['core', 'crm'],
      permissoes: ['crm.leads.read'],
    });
    assert.deepEqual(hrefsVisiveis(convidado), []);
  });

  it('o rótulo visível já vem no vocabulário do tenant', () => {
    const recepcao = viewer({ modulos: ['core', 'crm'], permissoes: ['crm.leads.read'] });
    const terms = { 'crm.leads': { singular: 'interessado', plural: 'interessados' } };
    const leads = visibleNavigation(recepcao, terms)
      .flatMap((g) => g.items)
      .find((i) => i.href === '/crm/leads');
    assert.equal(leads?.label, 'Interessados');
  });
});
