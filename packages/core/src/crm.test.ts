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
  formatCents,
  isClosedStage,
  isLeadClosed,
  nextLeadStatuses,
  parseCents,
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
