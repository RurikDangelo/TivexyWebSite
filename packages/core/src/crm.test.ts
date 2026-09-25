/**
 * Testes dos contratos do CRM.
 *
 * O teste de dinheiro é o que mais importa aqui. `1.234` no Brasil é mil
 * duzentos e trinta e quatro; lido como decimal vira R$ 1,23 — um erro de mil
 * vezes que passa despercebido porque o número continua plausível na tela.
 *
 *   npm run test:core
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  CRM_LEAD_STATUSES,
  CRM_STAGE_KINDS,
  type CrmLeadStatus,
  boardTotals,
  formatCents,
  formatCentsInput,
  isClosedStage,
  isLeadClosed,
  missingExits,
  nextLeadStatuses,
  orderStages,
  parseCents,
  stageTotals,
  totalsByKind,
} from './crm.ts';

describe('etapas', () => {
  it('só `open` mantém a oportunidade viva', () => {
    assert.equal(isClosedStage('open'), false);
    assert.equal(isClosedStage('won'), true);
    assert.equal(isClosedStage('lost'), true);
  });

  it('todo tipo de etapa tem resposta', () => {
    for (const kind of CRM_STAGE_KINDS) {
      assert.equal(typeof isClosedStage(kind), 'boolean', kind);
    }
  });
});

describe('leads', () => {
  it('terminais são exatamente dois, e por motivos opostos', () => {
    const terminais = CRM_LEAD_STATUSES.filter(isLeadClosed);
    assert.deepEqual([...terminais], ['disqualified', 'converted']);
  });

  it('todo estado tem transições definidas', () => {
    for (const status of CRM_LEAD_STATUSES) {
      assert.ok(Array.isArray(nextLeadStatuses(status)), status);
    }
  });

  it('convertido é o fim da linha', () => {
    assert.deepEqual([...nextLeadStatuses('converted')], []);
  });

  /*
   * Converter cria conta, pessoa e oportunidade numa transação. Se aparecesse
   * como transição solta, a tela ofereceria um botão que marca o lead como
   * convertido sem nada do outro lado — e o relatório de origem passaria a
   * contar clientes que não existem.
   */
  it('nenhum estado oferece `converted` como transição', () => {
    for (const status of CRM_LEAD_STATUSES) {
      assert.ok(
        !nextLeadStatuses(status).includes('converted'),
        `${status} ofereceu converter como se fosse troca de estado`,
      );
    }
  });

  it('nenhuma transição aponta para um estado que não existe', () => {
    const conhecidos = new Set<CrmLeadStatus>(CRM_LEAD_STATUSES);
    for (const status of CRM_LEAD_STATUSES) {
      for (const destino of nextLeadStatuses(status)) {
        assert.ok(conhecidos.has(destino), `${status} → ${destino}`);
      }
    }
  });

  it('nenhum estado transiciona para si mesmo', () => {
    for (const status of CRM_LEAD_STATUSES) {
      assert.ok(!nextLeadStatuses(status).includes(status), `${status} → ${status}`);
    }
  });

  it('desqualificado volta para a fila — engano acontece', () => {
    assert.deepEqual([...nextLeadStatuses('disqualified')], ['new']);
  });
});

describe('dinheiro', () => {
  it('o ponto é separador de milhar, não decimal', () => {
    // O erro de mil vezes. `1.234` são mil duzentos e trinta e quatro reais.
    assert.equal(parseCents('1.234'), 123400);
    assert.equal(parseCents('1.234,56'), 123456);
  });

  it('a vírgula é o decimal', () => {
    assert.equal(parseCents('1234,56'), 123456);
    assert.equal(parseCents('0,99'), 99);
    assert.equal(parseCents('10,5'), 1050);
  });

  it('inteiro sem separador nenhum', () => {
    assert.equal(parseCents('1234'), 123400);
    assert.equal(parseCents('0'), 0);
  });

  it('recusa em vez de virar zero', () => {
    // Zero seria uma oportunidade de R$ 0,00 que ninguém pediu, e ninguém
    // repara até o relatório de faturamento.
    for (const entrada of ['', '   ', 'abc', '12,345', '1,2,3', '-5', '1e3', 'R$ 10']) {
      assert.equal(parseCents(entrada), null, entrada);
    }
  });

  it('ida e volta preserva o valor', () => {
    for (const centavos of [0, 1, 99, 100, 123456, 999999999]) {
      const texto = formatCents(centavos)
        .replace(/[^\d,.]/g, '')
        .trim();
      assert.equal(parseCents(texto), centavos, `${centavos} → ${texto}`);
    }
  });

  it('formata em reais', () => {
    // ` ` é o espaço rígido que o Intl usa depois do símbolo.
    assert.match(formatCents(123456), /R\$\s?1\.234,56/);
    assert.match(formatCents(0), /R\$\s?0,00/);
  });
});

describe('funil — a ordem das colunas', () => {
  const etapa = (id: string, kind: 'open' | 'won' | 'lost', position: number, name = id) => ({
    id,
    kind,
    position,
    name,
  });

  it('abertas pela posição, depois ganho, depois perda', () => {
    const ordem = orderStages([
      etapa('perdido', 'lost', 1),
      etapa('proposta', 'open', 2),
      etapa('ganho', 'won', 0),
      etapa('contato', 'open', 1),
    ]).map((s) => s.id);
    assert.deepEqual(ordem, ['contato', 'proposta', 'ganho', 'perdido']);
  });

  it('o tipo vence a posição — a perda não aparece no meio do caminho', () => {
    const ordem = orderStages([etapa('perdido', 'lost', 0), etapa('proposta', 'open', 99)]);
    assert.deepEqual(
      ordem.map((s) => s.id),
      ['proposta', 'perdido'],
    );
  });

  it('empate de posição não depende da ordem de chegada', () => {
    const a = orderStages([etapa('b', 'open', 1, 'Beta'), etapa('a', 'open', 1, 'Alfa')]);
    const b = orderStages([etapa('a', 'open', 1, 'Alfa'), etapa('b', 'open', 1, 'Beta')]);
    assert.deepEqual(
      a.map((s) => s.id),
      b.map((s) => s.id),
    );
  });

  it('não altera a lista recebida', () => {
    const lista = [etapa('z', 'lost', 0), etapa('a', 'open', 0)];
    orderStages(lista);
    assert.deepEqual(
      lista.map((s) => s.id),
      ['z', 'a'],
    );
  });
});

describe('funil — totais', () => {
  const etapas = [
    { id: 'contato', name: 'Contato', kind: 'open' as const, position: 1 },
    { id: 'proposta', name: 'Proposta', kind: 'open' as const, position: 2 },
    { id: 'ganho', name: 'Ganho', kind: 'won' as const, position: 3 },
    { id: 'perdido', name: 'Perdido', kind: 'lost' as const, position: 4 },
  ];

  it('toda etapa aparece, inclusive a vazia — zero é diferente de não calculado', () => {
    const t = stageTotals(etapas, [{ stageId: 'contato', valueCents: 1000 }]);
    assert.deepEqual(t.get('proposta'), { count: 0, cents: 0 });
    assert.deepEqual(t.get('contato'), { count: 1, cents: 1000 });
  });

  it('oportunidade de etapa fora do quadro não é somada em lugar nenhum', () => {
    const t = boardTotals(etapas, [{ stageId: 'de-outro-funil', valueCents: 999_999 }]);
    assert.deepEqual(t.open, { count: 0, cents: 0 });
  });

  it('a situação vem da etapa', () => {
    const t = boardTotals(etapas, [
      { stageId: 'contato', valueCents: 150_000 },
      { stageId: 'proposta', valueCents: 450_000 },
      { stageId: 'proposta', valueCents: 50 },
      { stageId: 'ganho', valueCents: 1_000_000 },
      { stageId: 'perdido', valueCents: 30_000 },
    ]);
    assert.deepEqual(t.open, { count: 3, cents: 600_050 });
    assert.deepEqual(t.won, { count: 1, cents: 1_000_000 });
    assert.deepEqual(t.lost, { count: 1, cents: 30_000 });
  });

  it('centavos somados como inteiros fecham exato — o que ponto flutuante não faz', () => {
    /* 0,10 + 0,20 em reais é 0,30000000000000004. Em centavos, 30. */
    const t = boardTotals(etapas, [
      { stageId: 'contato', valueCents: 10 },
      { stageId: 'contato', valueCents: 20 },
    ]);
    assert.equal(t.open.cents, 30);
    assert.equal(formatCents(t.open.cents).replace(/\s/g, ' '), 'R$ 0,30');
  });
});

describe('funil — por onde sair', () => {
  it('funil sem ganho e sem perda diz que faltam os dois', () => {
    assert.deepEqual(missingExits([{ kind: 'open' }]), ['won', 'lost']);
  });

  it('funil completo não reclama', () => {
    assert.deepEqual(missingExits([{ kind: 'open' }, { kind: 'won' }, { kind: 'lost' }]), []);
  });
});

describe('formatCentsInput', () => {
  it('é o que a pessoa digitaria', () => {
    assert.equal(formatCentsInput(450_000), '4.500,00');
    assert.equal(formatCentsInput(5), '0,05');
    assert.equal(formatCentsInput(0), '0,00');
  });

  it('volta inteira: o que o campo mostra, parseCents lê de volta igual', () => {
    for (const cents of [0, 1, 99, 100, 12_345, 450_000, 123_456_789, 9_007_199_254_740]) {
      assert.equal(parseCents(formatCentsInput(cents)), cents, String(cents));
    }
  });
});

describe('totalsByKind', () => {
  it('soma por situação, com a situação já embutida', () => {
    const t = totalsByKind([
      { kind: 'open', valueCents: 100 },
      { kind: 'open', valueCents: 250 },
      { kind: 'won', valueCents: 1000 },
    ]);
    assert.deepEqual(t.open, { count: 2, cents: 350 });
    assert.deepEqual(t.won, { count: 1, cents: 1000 });
    assert.deepEqual(t.lost, { count: 0, cents: 0 });
  });

  it('lista vazia dá zero em tudo, não indefinido', () => {
    const t = totalsByKind([]);
    for (const k of CRM_STAGE_KINDS) assert.deepEqual(t[k], { count: 0, cents: 0 });
  });
});
