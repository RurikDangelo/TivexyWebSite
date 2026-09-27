/**
 *   npm run test:web
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  alturasDasBarras,
  avisoDeTruncamento,
  funilAberto,
  janelaDoPeriodo,
  periodoPedido,
  reaisCompactos,
  serieDeVendas,
  ticketMedio,
  totaisDaSerie,
  variacaoPercentual,
} from './dashboard.ts';

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

  it('variação sem base anterior é null, nunca 0%', () => {
    /* Os dois casos que o `<Stat>` escreve como "sem base para comparar". */
    assert.equal(variacaoPercentual(7000, 0), null);
    assert.equal(variacaoPercentual(7000, null), null);
    /* Zero medido continua sendo zero: estável é uma informação, ausência não. */
    assert.equal(variacaoPercentual(1000, 1000), 0);
    assert.equal(variacaoPercentual(1500, 1000), 50);
    assert.equal(variacaoPercentual(500, 1000), -50);
  });

  it('a janela anterior tem o mesmo tamanho e não encosta na atual', () => {
    const j = janelaDoPeriodo('2026-09-26', '7d');
    assert.deepEqual(j, {
      dias: 7,
      inicio: '2026-09-20',
      fim: '2026-09-26',
      inicioAnterior: '2026-09-13',
      fimAnterior: '2026-09-19',
    });
    /* O vão mais largo que o painel pede tem de caber no teto de 92 dias do RPC. */
    const noventa = janelaDoPeriodo('2026-09-26', '90d');
    const vao = (a: string, b: string) =>
      (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000;
    assert.equal(vao(noventa.inicio, noventa.fim), 89);
    assert.equal(vao(noventa.inicioAnterior, noventa.fimAnterior), 89);
  });

  it('período desconhecido cai no padrão, em vez de quebrar a tela', () => {
    assert.equal(periodoPedido('7d'), '7d');
    assert.equal(periodoPedido('365d'), '30d');
    assert.equal(periodoPedido(undefined), '30d');
  });

  it('soma truncada se anuncia; soma completa fica calada', () => {
    assert.equal(avisoDeTruncamento(5000, 7200, 'negócios'), 'somei 5.000 de 7.200 negócios');
    assert.equal(avisoDeTruncamento(120, 120, 'negócios'), null);
    assert.equal(
      avisoDeTruncamento(120, null, 'negócios'),
      'somei 120 negócios; não sei se há mais',
    );
  });

  it('barra: zero é zero, e o valor pequeno não some', () => {
    assert.deepEqual(alturasDasBarras([0, 0], 100), [0, 0]);
    assert.deepEqual(alturasDasBarras([0, 1, 1000], 100), [0, 2, 100]);
  });

  it('a sparkline recebe só os totais, na ordem do tempo', () => {
    assert.deepEqual(
      totaisDaSerie([
        { dia: '2026-09-25', vendas: 1, totalCentavos: 100 },
        { dia: '2026-09-26', vendas: 0, totalCentavos: 0 },
      ]),
      [100, 0],
    );
  });

  it('rótulo de eixo abrevia, e zero não vira "R$ 0,0"', () => {
    assert.equal(reaisCompactos(0), 'R$ 0');
    assert.match(reaisCompactos(123_400), /^R\$ 1,2\s?mil$/);
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
