/**
 * Testes do motor de automações.
 *
 * O motor é puro, então cada combinação de operador e valor custa
 * milissegundos — que é exatamente o argumento para a decisão morar aqui e
 * não junto da escrita. Um motor testável só com banco teria os casos raros
 * sem teste, e os casos raros são onde uma automação dispara errado.
 *
 * Dois grupos importam mais que os outros:
 *
 *   - **campo ausente**, porque a resposta intuitiva está errada;
 *   - **comparação de número**, porque comparar `"900" > "1000"` como texto dá
 *     verdadeiro e ninguém percebe.
 *
 *   npm run test:core
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  AUTOMATION_ACTIONS,
  AUTOMATION_ACTION_LABEL,
  AUTOMATION_EVENTS,
  AUTOMATION_EVENT_FIELDS,
  AUTOMATION_EVENT_LABEL,
  AUTOMATION_OPERATORS,
  AUTOMATION_OPERATOR_LABEL,
  type AutomationRule,
  applyTemplate,
  checkRule,
  matchesCondition,
  matchesRule,
  needsValue,
  planAutomations,
} from './automation.ts';

const AGENDAR = {
  kind: 'crm.activity.create' as const,
  params: { subject: 'Ligar', dueInDays: '1' },
};

function regra(sobrepor: Partial<AutomationRule> = {}): AutomationRule {
  return {
    id: 'r1',
    name: 'Regra',
    event: 'crm.lead.created',
    conditions: [],
    actions: [AGENDAR],
    isActive: true,
    ...sobrepor,
  };
}

const LEAD = {
  type: 'crm.lead.created' as const,
  data: { name: 'Maria', source: 'Instagram', companyName: null, status: 'new' },
};

/* ── Catálogo ──────────────────────────────────────────────────────────── */

describe('o catálogo é completo', () => {
  it('todo gatilho tem rótulo e campos', () => {
    for (const evento of AUTOMATION_EVENTS) {
      assert.ok(AUTOMATION_EVENT_LABEL[evento]?.length > 0, evento);
      assert.ok(AUTOMATION_EVENT_FIELDS[evento]?.length > 0, evento);
    }
  });

  it('todo operador e toda ação têm rótulo', () => {
    for (const operador of AUTOMATION_OPERATORS) {
      assert.ok(AUTOMATION_OPERATOR_LABEL[operador]?.length > 0, operador);
    }
    for (const acao of AUTOMATION_ACTIONS) {
      assert.ok(AUTOMATION_ACTION_LABEL[acao]?.length > 0, acao);
    }
  });

  it('não existe ação que dependa de canal externo', () => {
    /*
     * A fronteira do módulo, travada por teste. Enquanto não houver SMTP
     * próprio nem credencial da Meta, uma ação que diga "notifiquei o
     * cliente" sem notificar ninguém é pior do que automação nenhuma — ela
     * faz a pessoa parar de conferir.
     */
    for (const acao of AUTOMATION_ACTIONS) {
      assert.doesNotMatch(
        acao,
        /mail|whatsapp|sms|webhook|notify|push/i,
        `${acao} parece depender de canal externo`,
      );
    }
  });

  it('só `exists` e `empty` dispensam valor', () => {
    assert.equal(needsValue('exists'), false);
    assert.equal(needsValue('empty'), false);
    assert.equal(needsValue('eq'), true);
    assert.equal(needsValue('gt'), true);
  });
});

/* ── Condições ─────────────────────────────────────────────────────────── */

describe('matchesCondition — texto', () => {
  it('igualdade ignora caixa', () => {
    assert.equal(
      matchesCondition({ field: 'source', operator: 'eq', value: 'instagram' }, LEAD.data),
      true,
    );
  });

  it('contém procura pedaço, ignorando caixa', () => {
    assert.equal(
      matchesCondition({ field: 'source', operator: 'contains', value: 'GRAM' }, LEAD.data),
      true,
    );
  });

  it('diferente de é o oposto de igual', () => {
    assert.equal(
      matchesCondition({ field: 'source', operator: 'neq', value: 'Feira' }, LEAD.data),
      true,
    );
  });
});

describe('matchesCondition — campo ausente', () => {
  /*
   * O grupo que mais importa, porque a resposta intuitiva está errada.
   *
   * Tratar ausente como string vazia faria "origem é diferente de Instagram"
   * disparar para todo lead **sem origem** — o contrário do que quem escreveu
   * a regra quis dizer.
   */
  it('nenhum operador de comparação casa com campo nulo', () => {
    for (const operador of ['eq', 'neq', 'contains', 'gt', 'gte', 'lt', 'lte'] as const) {
      assert.equal(
        matchesCondition({ field: 'companyName', operator: operador, value: 'x' }, LEAD.data),
        false,
        `${operador} casou com campo nulo`,
      );
    }
  });

  it('nem com campo que o evento não traz', () => {
    assert.equal(
      matchesCondition({ field: 'inventado', operator: 'eq', value: 'x' }, LEAD.data),
      false,
    );
  });

  it('`exists` e `empty` são os que respondem sobre ausência', () => {
    assert.equal(matchesCondition({ field: 'source', operator: 'exists' }, LEAD.data), true);
    assert.equal(matchesCondition({ field: 'companyName', operator: 'exists' }, LEAD.data), false);
    assert.equal(matchesCondition({ field: 'companyName', operator: 'empty' }, LEAD.data), true);
    assert.equal(matchesCondition({ field: 'source', operator: 'empty' }, LEAD.data), false);
  });

  it('texto só de espaço conta como vazio', () => {
    const dados = { source: '   ' };
    assert.equal(matchesCondition({ field: 'source', operator: 'empty' }, dados), true);
  });
});

describe('matchesCondition — número', () => {
  const VENDA = { type: 'erp.sale.confirmed' as const, data: { totalCents: 90000, number: 7 } };

  it('compara como número, não como texto', () => {
    /*
     * O erro clássico e silencioso: `"900" > "1000"` é verdadeiro em texto.
     * Sem este teste, "venda acima de mil reais" dispararia para vendas de
     * novecentos.
     */
    assert.equal(
      matchesCondition({ field: 'totalCents', operator: 'gt', value: '100000' }, VENDA.data),
      false,
    );
    assert.equal(
      matchesCondition({ field: 'totalCents', operator: 'gt', value: '80000' }, VENDA.data),
      true,
    );
  });

  it('texto que parece número também é comparado como número', () => {
    // Quem digita na tela manda texto. `"90000"` precisa valer como 90000.
    const dados = { totalCents: '90000' };
    assert.equal(
      matchesCondition({ field: 'totalCents', operator: 'gte', value: '90000' }, dados),
      true,
    );
  });

  it('comparação de ordem com valor que não é número não casa', () => {
    // Em vez de virar comparação de texto, que daria verdadeiro por acaso.
    assert.equal(
      matchesCondition({ field: 'totalCents', operator: 'gt', value: 'muito' }, VENDA.data),
      false,
    );
  });

  it('menor e menor ou igual funcionam nas duas bordas', () => {
    assert.equal(
      matchesCondition({ field: 'number', operator: 'lt', value: '7' }, VENDA.data),
      false,
    );
    assert.equal(
      matchesCondition({ field: 'number', operator: 'lte', value: '7' }, VENDA.data),
      true,
    );
  });
});

/* ── A regra inteira ───────────────────────────────────────────────────── */

describe('matchesRule', () => {
  it('regra desligada nunca casa', () => {
    assert.equal(matchesRule(regra({ isActive: false }), LEAD), false);
  });

  it('gatilho diferente nunca casa', () => {
    assert.equal(matchesRule(regra({ event: 'erp.sale.confirmed' }), LEAD), false);
  });

  it('sem condição, vale para todo evento daquele tipo', () => {
    // O caso comum — "toda venda confirmada agenda o pós-venda". Exigir uma
    // condição vazia seria burocracia.
    assert.equal(matchesRule(regra(), LEAD), true);
  });

  it('TODAS as condições precisam valer', () => {
    const duas = regra({
      conditions: [
        { field: 'source', operator: 'eq', value: 'Instagram' },
        { field: 'status', operator: 'eq', value: 'qualified' },
      ],
    });
    assert.equal(matchesRule(duas, LEAD), false, 'a segunda condição não vale');
  });
});

describe('planAutomations', () => {
  it('devolve uma ação por ação de cada regra que casou', () => {
    const plano = planAutomations(LEAD, [
      regra({ id: 'a', name: 'A' }),
      regra({ id: 'b', name: 'B', isActive: false }),
      regra({ id: 'c', name: 'C', actions: [AGENDAR, AGENDAR] }),
    ]);

    assert.deepEqual(
      plano.map((p) => p.ruleId),
      ['a', 'c', 'c'],
    );
  });

  it('a ordem é determinística', () => {
    /*
     * Uma automação que roda em ordem diferente a cada vez é impossível de
     * depurar quando o cliente diz "às vezes não funciona".
     */
    const regras = [regra({ id: '1', name: 'Um' }), regra({ id: '2', name: 'Dois' })];
    const primeira = planAutomations(LEAD, regras).map((p) => p.ruleId);
    const segunda = planAutomations(LEAD, regras).map((p) => p.ruleId);
    assert.deepEqual(primeira, segunda);
    assert.deepEqual(primeira, ['1', '2']);
  });

  it('nenhuma regra é nenhuma ação', () => {
    assert.deepEqual(planAutomations(LEAD, []), []);
  });

  it('o nome da regra vai junto — o log precisa dizer quem disparou', () => {
    const [primeira] = planAutomations(LEAD, [regra({ name: 'Pós-venda' })]);
    assert.equal(primeira?.ruleName, 'Pós-venda');
  });
});

/* ── Validação ─────────────────────────────────────────────────────────── */

describe('checkRule', () => {
  const boa = { name: 'Boa', event: 'crm.lead.created', conditions: [], actions: [AGENDAR] };

  it('aceita a regra mínima: nome, gatilho e uma ação', () => {
    assert.deepEqual(checkRule(boa), []);
  });

  it('recusa condição sobre campo que o gatilho não traz', () => {
    /*
     * O que o banco não pegaria. Sem isto a regra é salva, nunca dispara e
     * não dá erro — o defeito sem sintoma.
     */
    const problemas = checkRule({
      ...boa,
      conditions: [{ field: 'totalCents', operator: 'gt', value: '1' }],
    });
    assert.equal(problemas.length, 1);
    assert.equal(problemas[0]?.path, 'conditions[0].field');
    assert.match(problemas[0]?.message ?? '', /disponíveis/);
  });

  it('relata todos os problemas de uma vez', () => {
    // Corrigir um por vez, salvando e vendo o próximo, é o que faz alguém
    // desistir no terceiro.
    const problemas = checkRule({ name: '', event: 'crm.lead.created', actions: [] });
    assert.ok(problemas.length >= 2, JSON.stringify(problemas));
    assert.ok(problemas.some((p) => p.path === 'name'));
    assert.ok(problemas.some((p) => p.path === 'actions'));
  });

  it('gatilho desconhecido para a conferência ali', () => {
    // Sem gatilho válido não há como saber quais campos existem.
    const problemas = checkRule({ ...boa, event: 'nao.existe' });
    assert.deepEqual(
      problemas.map((p) => p.path),
      ['event'],
    );
  });

  it('operador que precisa de valor e não tem', () => {
    const problemas = checkRule({
      ...boa,
      conditions: [{ field: 'source', operator: 'eq' }],
    });
    assert.equal(problemas[0]?.path, 'conditions[0].value');
  });

  it('`exists` não precisa de valor', () => {
    assert.deepEqual(
      checkRule({ ...boa, conditions: [{ field: 'source', operator: 'exists' }] }),
      [],
    );
  });

  it('ação sem os parâmetros obrigatórios', () => {
    const problemas = checkRule({
      ...boa,
      actions: [{ kind: 'crm.activity.create', params: { subject: 'Ligar' } }],
    });
    assert.equal(problemas[0]?.path, 'actions[0].params.dueInDays');
  });

  it('regra sem ação nenhuma não faz nada, e isso é problema', () => {
    const problemas = checkRule({ ...boa, actions: [] });
    assert.ok(problemas.some((p) => p.path === 'actions'));
  });
});

/* ── Substituição de campos ────────────────────────────────────────────── */

describe('applyTemplate', () => {
  const dados = { number: 7, customerName: 'Padaria do Bairro', obs: null };

  it('troca o campo pelo valor', () => {
    assert.equal(applyTemplate('Comissão da venda #{{number}}', dados), 'Comissão da venda #7');
  });

  it('aceita espaço dentro das chaves', () => {
    assert.equal(applyTemplate('{{ customerName }}', dados), 'Padaria do Bairro');
  });

  it('troca todas as ocorrências', () => {
    assert.equal(applyTemplate('{{number}} e {{number}}', dados), '7 e 7');
  });

  it('campo nulo vira vazio', () => {
    assert.equal(applyTemplate('Obs: {{obs}}.', dados), 'Obs: .');
  });

  it('campo que não existe vira vazio — não fica à mostra', () => {
    /*
     * Deixar `{{inventado}}` aparecer na agenda do cliente mostraria a
     * implementação a quem não tem nada com isso, e mostraria como um
     * defeito — que é o que é.
     */
    assert.equal(applyTemplate('Ligar para {{inventado}}', dados), 'Ligar para ');
  });

  it('texto sem chaves passa inteiro', () => {
    assert.equal(applyTemplate('Ligar para o cliente', dados), 'Ligar para o cliente');
  });

  it('não avalia expressão — é substituição, não linguagem', () => {
    // Parar aqui é decisão: um mecanismo de modelo com expressões vira uma
    // linguagem dentro de um campo de formulário.
    assert.equal(applyTemplate('{{1 + 1}}', dados), '{{1 + 1}}');
    assert.equal(applyTemplate('{{number.toString()}}', dados), '{{number.toString()}}');
  });
});
