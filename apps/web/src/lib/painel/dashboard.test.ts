/**
 *   npm run test:web
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  alturasDasBarras,
  comparacaoSemanal,
  funilAberto,
  serieDeVendas,
  ticketMedio,
} from './dashboard.ts';

const dia = (n: number, total: number) => ({
  dia: `2026-09-${String(n).padStart(2, '0')}`,
  vendas: total > 0 ? 1 : 0,
  totalCentavos: total,
});

describe('painel', () => {
  it('a série vem do banco com número de verdade, inclusive bigint em texto', () => {
    assert.deepEqual(
      serieDeVendas([{ day: '2026-09-25', sales_count: '3', total_cents: '15990' }]),
      [{ dia: '2026-09-25', vendas: 3, totalCentavos: 15990 }],
    );
  });

  it('ticket médio sem venda é "sem ticket", não zero', () => {
    assert.equal(ticketMedio(0, 0), null);
    assert.equal(ticketMedio(1000, 3), 333);
  });

  it('semana contra semana: sem base, sem porcentagem', () => {
    const sem = Array.from({ length: 14 }, (_, i) => dia(i + 12, i >= 7 ? 1000 : 0));
    assert.deepEqual(comparacaoSemanal(sem), { atual: 7000, anterior: 0, variacao: null });
    const com = Array.from({ length: 14 }, (_, i) => dia(i + 12, i >= 7 ? 1500 : 1000));
    assert.equal(comparacaoSemanal(com).variacao, 50);
  });

  it('barra: zero é zero, e o valor pequeno não some', () => {
    assert.deepEqual(alturasDasBarras([0, 0], 100), [0, 0]);
    assert.deepEqual(alturasDasBarras([0, 1, 1000], 100), [0, 2, 100]);
  });

  it('funil: só etapas em andamento, na ordem, com quantidade e valor', () => {
    const etapas = [
      { id: 'b', nome: 'Proposta', tipo: 'open', posicao: 2 },
      { id: 'a', nome: 'Contato', tipo: 'open', posicao: 1 },
      { id: 'g', nome: 'Ganho', tipo: 'won', posicao: 3 },
    ];
    const negocios = [
      { etapaId: 'a', valorCentavos: 1000 },
      { etapaId: 'a', valorCentavos: null },
      { etapaId: 'b', valorCentavos: 5000 },
    ];
    assert.deepEqual(funilAberto(etapas, negocios), [
      { id: 'a', nome: 'Contato', quantidade: 2, valorCentavos: 1000 },
      { id: 'b', nome: 'Proposta', quantidade: 1, valorCentavos: 5000 },
    ]);
  });
});
