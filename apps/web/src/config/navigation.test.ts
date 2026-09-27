/**
 * O menu: o que aparece, para quem, com que nome — e se a tela existe.
 *
 * Nasceu de um defeito visto ao abrir o sistema, não em teste: para a clínica
 * odontológica, a página dizia "Interessados" e o menu, "Leads". Nenhum teste
 * comparava as duas superfícies, e é o que os primeiros abaixo fazem — com os
 * blueprints de verdade, não com um vocabulário inventado para o teste.
 *
 * O segundo defeito veio da mesma raiz e é o que o bloco de COBERTURA mede: o
 * menu declarava 16 itens para 34 telas, e o dono concluiu que faltavam
 * módulos que existem. A verificação lê o disco — `app/(app)` — e cobra os
 * dois sentidos: tela de primeira ordem que ninguém declarou, e item que
 * promete tela que não existe.
 *
 *   npm run test:web
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  ANONYMOUS,
  type ModuleCode,
  type PermissionCode,
  type Viewer,
  matchRule,
} from '@tivexy/core';
import { BLUEPRINTS } from '@tivexy/core/blueprints';

import { ABAS_COM_TELA, ABAS_PENDENTES, abaAtiva } from '../components/admin/tabs.ts';
import { capitalizar } from '../lib/terms/vocabulary.ts';
import {
  type NavHref,
  type VisibleItem,
  labelOf,
  navItems as itens,
  sectionTitle,
  utilityNavigation,
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
  '/tutorial': 'guia de ponta a ponta, não uma lista',
  '/erp/financeiro': 'junta contas a receber, a pagar e o fluxo de caixa',
  '/configuracoes': 'nome da seção',
  '/avisos': 'os avisos são da própria pessoa, não um recurso da empresa',
  '/conta': 'a conta de quem olha, que não muda de nome com o nicho',
  '/empresas': 'ação de trocar de contexto, não a lista de um recurso da empresa',
  '/chat': 'conversa da equipe, não um recurso da empresa',
};

/*
 * Itens declarados antes da tela existir — o oposto de fingir funcionalidade.
 * Enquanto estão aqui, a rota ainda não tem regra própria e o invariante
 * rota↔termo não vale para eles; ele volta a valer sozinho quando a tela
 * nascer e o item virar `ready`.
 */
const AINDA_SEM_TELA: Readonly<Record<string, string>> = {
  '/equipe/times':
    'teams/team_members existem no banco com RLS e permissão concedida; a tela não existe',
};

/*
 * Telas que existem e NÃO entram no menu, cada uma com o motivo.
 *
 * São destino, não seção: chega-se a elas por link de dentro da tela-pai ou
 * por redirecionamento. Uma tela nova que ninguém declarou no catálogo nem
 * aqui quebra o teste de cobertura — que é como o menu deixa de perder tela.
 */
const FORA_DO_MENU: Readonly<Record<string, string>> = {
  '/acesso-negado': 'explica uma negação; chega-se a ela por redirecionamento',
  '/convite': 'saída do limbo: quem a vê ainda não tem menu',
  '/onboarding': 'saída do limbo: conta sem empresa',
  '/preparando': 'saída do limbo: empresa em provisionamento',
  '/crm/oportunidades/funis': 'configuração da tela-pai, alcançada de dentro dela',
  '/erp/produtos/categorias': 'configuração da tela-pai, alcançada de dentro dela',
  '/erp/vendas/formas': 'configuração da tela-pai, alcançada de dentro dela',
  '/erp/vendas/nova': 'ação da tela-pai; o chrome pode promovê-la a botão, não a seção',
};

/* ── O que existe no disco ────────────────────────────────────────────── */

const RAIZ_DAS_TELAS = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'app',
  '(app)',
);

/** Onde ficaria a tela deste caminho. */
function arquivoDaTela(href: string): string {
  return path.join(RAIZ_DAS_TELAS, ...href.split('/').filter(Boolean), 'page.tsx');
}

function temTela(href: string): boolean {
  return fs.existsSync(arquivoDaTela(href));
}

/**
 * Toda tela de primeira ordem de `app/(app)`.
 *
 * Rota dinâmica fica de fora, com os filhos: `[id]` é destino de link — um
 * registro, não uma seção —, e nenhum menu pode oferecer "o contato tal".
 * Grupo de rotas (`(nome)`) não entra no caminho, que é como o Next o trata.
 */
function telasNoDisco(diretorio: string, prefixo = ''): string[] {
  const achadas: string[] = [];
  for (const entrada of fs.readdirSync(diretorio, { withFileTypes: true })) {
    if (!entrada.isDirectory() || entrada.name.startsWith('[')) continue;
    const caminho = path.join(diretorio, entrada.name);
    const href = entrada.name.startsWith('(') ? prefixo : `${prefixo}/${entrada.name}`;
    if (href !== '' && fs.existsSync(path.join(caminho, 'page.tsx'))) achadas.push(href);
    achadas.push(...telasNoDisco(caminho, href));
  }
  return achadas;
}

const TELAS = telasNoDisco(RAIZ_DAS_TELAS);
const DECLARADOS: readonly string[] = itens.map((item) => item.href);

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

const caminhos = (lista: readonly VisibleItem[]) => lista.map((i) => i.href);

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

  it('a lista de pessoas não usa o substantivo reservado às equipes', () => {
    /*
     * O defeito que o dono relatou: "Equipe" batizava a lista de PESSOAS com o
     * termo de `core.teams`, e quem procurava equipes concluía que a tela não
     * existia. Nenhum dos dois pode voltar ao nome do outro.
     */
    const pessoas = itens.find((i) => i.href === '/equipe');
    assert.ok(pessoas, '/equipe saiu do menu');
    assert.equal(pessoas.term, 'core.users');
    assert.equal(labelOf(pessoas, {}), 'Pessoas');

    const equipes = itens.find((i) => i.href === '/equipe/times');
    assert.ok(equipes, 'o item de equipes saiu do menu');
    assert.equal(equipes.term, 'core.teams');
    assert.notEqual(equipes.status, 'ready', 'a tela de equipes não existe');
  });
});

describe('todo item diz o que se faz na tela', () => {
  it('a linha existe, é curta e não é frase', () => {
    for (const item of itens) {
      assert.notEqual(item.descricao.trim(), '', `${item.href} sem subtítulo`);
      assert.ok(
        item.descricao.length <= 70,
        `${item.href}: ${item.descricao.length} caracteres não cabem na coluna`,
      );
      assert.ok(!item.descricao.endsWith('.'), `${item.href}: é um rótulo, não uma frase`);
    }
  });
});

describe('todo item sabe qual recurso lista', () => {
  it('o termo do item é o recurso da permissão que a rota exige', () => {
    for (const item of itens) {
      if (item.term === undefined) continue;
      /* Item sem tela ainda não tem regra própria; ver AINDA_SEM_TELA. */
      if (item.status !== 'ready') continue;
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

describe('cobertura: menu e telas não divergem', () => {
  it('a varredura acha as telas — se ela vier vazia, o resto não prova nada', () => {
    assert.ok(TELAS.length > 20, `achei ${TELAS.length} telas em ${RAIZ_DAS_TELAS}`);
  });

  it('toda tela de primeira ordem está no menu ou tem motivo escrito', () => {
    const orfas = TELAS.filter(
      (href) => !DECLARADOS.includes(href) && !(href in FORA_DO_MENU),
    ).sort();
    assert.deepEqual(
      orfas,
      [],
      'declare a tela em navigation.ts (menu ou rodapé) ou explique em FORA_DO_MENU',
    );
  });

  it('a lista de telas fora do menu não guarda entrada morta', () => {
    for (const href of Object.keys(FORA_DO_MENU)) {
      assert.ok(TELAS.includes(href), `${href} não existe mais em app/(app)`);
      assert.ok(!DECLARADOS.includes(href), `${href} entrou no menu e não precisa de exceção`);
    }
  });

  it('item pronto tem tela no disco', () => {
    const prometidas = itens
      .filter((item) => item.status === 'ready' && !temTela(item.href))
      .map((item) => item.href);
    assert.deepEqual(prometidas, [], 'item `ready` sem page.tsx promete tela que não existe');
  });

  it('item não pronto não tem tela, e diz o que falta', () => {
    for (const item of itens) {
      if (item.status === 'ready') continue;
      assert.ok(
        item.href in AINDA_SEM_TELA,
        `${item.href}: declare em AINDA_SEM_TELA por que a tela não existe`,
      );
      assert.ok(
        !temTela(item.href),
        `${item.href}: a tela existe — o item precisa virar \`ready\``,
      );
    }
  });

  it('a lista de telas por construir não guarda item que já ficou pronto', () => {
    for (const href of Object.keys(AINDA_SEM_TELA)) {
      const item = itens.find((i) => i.href === href);
      assert.ok(item, `${href} não está mais no menu`);
      assert.notEqual(item.status, 'ready', `${href} ficou pronto e não precisa de exceção`);
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

  it('o item por construir também obedece à regra da rota', () => {
    /*
     * "Equipes" é aviso, não porta — mas quem não alcançaria a rota não
     * precisa nem do aviso, e o item não pode virar uma brecha por onde o
     * menu conte o que existe do outro lado.
     */
    const recepcao = viewer({ modulos: ['core', 'crm'], permissoes: ['crm.leads.read'] });
    assert.ok(!hrefsVisiveis(recepcao).includes('/equipe/times'));

    const gestora = viewer({ modulos: ['core', 'crm'], permissoes: ['core.users.read'] });
    assert.ok(hrefsVisiveis(gestora).includes('/equipe/times'));
  });

  it('grupo sem nenhum item visível não aparece nem como cabeçalho', () => {
    const recepcao = viewer({ modulos: ['core', 'crm'], permissoes: ['crm.leads.read'] });
    const grupos = visibleNavigation(recepcao, {}).map((g) => g.label);
    assert.ok(!grupos.includes('ERP'));
    for (const grupo of visibleNavigation(recepcao, {})) assert.ok(grupo.items.length > 0);
  });

  it('a administração da plataforma não está no catálogo do cliente — nem para o Super Admin', () => {
    /*
     * ADR-005. Antes havia um grupo "Administração" que só o Super Admin via;
     * agora o painel é outra superfície (`/adminpanel`) e não tem entrada
     * nenhuma aqui. As duas metades da asserção importam:
     *
     * - para o dono do tenant, com TODAS as permissões de tenant, nada muda —
     *   ele nunca alcançou a plataforma e continua sem alcançar;
     * - para o próprio Super Admin, o item também não volta. Se ele voltasse,
     *   a casca do cliente ganharia de novo um atalho para o plano de
     *   controle, que é exatamente o que o dono contestou.
     */
    const dono = viewer({
      modulos: ['core', 'crm', 'erp', 'inventory', 'finance', 'automation', 'integrations'],
      permissoes: itens.flatMap((i) => {
        const r = matchRule(routeRules, i.href);
        return r.kind === 'permission' ? [r.permission] : [];
      }),
    });
    assert.ok(!visibleNavigation(dono, {}).some((g) => g.label === 'Administração'));

    const plataforma = viewer({ isSuperAdmin: true, tenant: null, membershipStatus: null });
    for (const href of [...hrefsVisiveis(dono), ...hrefsVisiveis(plataforma)]) {
      assert.ok(!href.startsWith('/admin'), `${href} não pode estar no menu do cliente`);
    }
  });

  it('Super Admin sem empresa escolhida não recebe item nenhum da operação', () => {
    /*
     * `decideAccess` deixaria o Super Admin abrir `/crm/leads`, mas sem
     * empresa a página não tem de quem mostrar dado. Oferecer o item seria
     * oferecer uma tela vazia.
     *
     * Antes desta onda a lista não era vazia: sobrava `/admin`. Agora é —
     * e é o resultado certo, porque a porta da plataforma está em outra
     * casca, não neste menu.
     */
    const plataforma = viewer({ isSuperAdmin: true, tenant: null, membershipStatus: null });
    assert.deepEqual(hrefsVisiveis(plataforma), []);
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

describe('o rodapé da sidebar', () => {
  it('sem sessão, nada', () => {
    assert.deepEqual(utilityNavigation(ANONYMOUS, {}), []);
  });

  it('com empresa, avisos e conta — e nada além disso', () => {
    const pessoa = viewer({ modulos: ['core'] });
    assert.deepEqual(caminhos(utilityNavigation(pessoa, {})), ['/avisos', '/conta']);
  });

  it('a troca de empresa só aparece para quem participa de mais de uma', () => {
    const pessoa = viewer({ modulos: ['core'] });
    assert.ok(!caminhos(utilityNavigation(pessoa, {}, { empresas: 1 })).includes('/empresas'));
    assert.ok(caminhos(utilityNavigation(pessoa, {}, { empresas: 2 })).includes('/empresas'));
    /* Sem o número, o conservador: oferecer troca a quem não tem para onde ir é pior. */
    assert.ok(!caminhos(utilityNavigation(pessoa, {})).includes('/empresas'));
  });

  it('sem empresa escolhida, os avisos somem e a conta fica', () => {
    /* Aviso é de uma empresa; conta é da pessoa. Quem está escolhendo tem uma, não a outra. */
    const escolhendo = viewer({ tenant: null, membershipStatus: null });
    assert.deepEqual(caminhos(utilityNavigation(escolhendo, {}, { empresas: 3 })), [
      '/conta',
      '/empresas',
    ]);
  });

  it('convite pendente ainda chega à própria conta', () => {
    /* É a saída do limbo: sem ela, quem foi convidado e não aceitou fica sem porta nenhuma. */
    const convidado = viewer({ membershipStatus: 'invited', modulos: ['core'] });
    assert.deepEqual(caminhos(utilityNavigation(convidado, {})), ['/conta']);
  });

  it('o rodapé não repete o que o menu já oferece', () => {
    const dono = viewer({
      isSuperAdmin: true,
      modulos: ['core', 'crm', 'erp', 'inventory', 'finance', 'automation', 'integrations'],
    });
    const noMenu = new Set(hrefsVisiveis(dono));
    for (const href of caminhos(utilityNavigation(dono, {}, { empresas: 2 }))) {
      assert.ok(!noMenu.has(href), `${href} apareceria duas vezes na mesma coluna`);
    }
  });
});

/* ── O painel da plataforma ───────────────────────────────────────────── */

const RAIZ_DO_PAINEL = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'app',
  '(admin)',
);

/**
 * O mesmo invariante do menu do cliente, aplicado às abas do `/adminpanel`.
 *
 * A casca do painel é outra (ADR-005), mas o defeito de que ela pode sofrer é
 * o mesmo: aba que promete tela inexistente, e tela que existe sem porta.
 * O disco é a verdade; `components/admin/tabs.ts` é a declaração.
 */
describe('cobertura: as abas do painel da plataforma', () => {
  it('toda aba pronta tem page.tsx no disco', () => {
    for (const aba of ABAS_COM_TELA) {
      const arquivo = path.join(RAIZ_DO_PAINEL, ...aba.href.split('/').filter(Boolean), 'page.tsx');
      assert.ok(fs.existsSync(arquivo), `${aba.href} está declarada e não tem tela`);
    }
  });

  it('toda aba pendente traz o motivo escrito, e nenhum caminho', () => {
    /* Sem isto, uma aba nasce "em breve" e fica — que é a forma educada de fingir. */
    for (const aba of ABAS_PENDENTES) {
      assert.equal(aba.href, null, `${aba.chave} é pendente e mesmo assim aponta para algum lugar`);
      assert.ok(aba.motivo.length > 40, `${aba.chave}: o motivo precisa explicar, não rotular`);
    }
  });

  it('toda regra de rota do painel é a da plataforma', () => {
    /*
     * A casca não filtra aba por papel — quem decide é a regra da rota, e ela
     * precisa valer para TODA aba, não só para a raiz. Uma aba nova fora do
     * prefixo `/adminpanel` cairia no padrão `member` e abriria para tenant.
     */
    for (const aba of ABAS_COM_TELA) {
      assert.equal(matchRule(routeRules, aba.href).kind, 'superAdmin', aba.href);
    }
  });

  it('a aba ativa é a mais específica que casa com o caminho', () => {
    assert.equal(abaAtiva('/adminpanel'), 'clientes');
    /* Filhas da lista de clientes continuam na aba Clientes. */
    assert.equal(abaAtiva('/adminpanel/clientes/novo'), 'clientes');
    assert.equal(abaAtiva('/adminpanel/clientes/abc-123'), 'clientes');
    assert.equal(abaAtiva('/adminpanel/usuarios'), 'usuarios');
    assert.equal(abaAtiva('/adminpanel/ramos'), 'ramos');
    assert.equal(abaAtiva('/adminpanel/dominios'), 'dominios');
  });
});
