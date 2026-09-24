/**
 * Testes de instante, dia e fuso.
 *
 * O caso que este arquivo existe para travar não é São Paulo — é a **virada
 * do horário de verão**. São Paulo não tem mais desde 2019, então um código
 * errado passaria em todo teste brasileiro e quebraria no primeiro cliente
 * fora daqui. Por isso quase todo teste abaixo usa `America/New_York`, que
 * ainda vira duas vezes por ano.
 *
 *   npm run test:core
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_TIME_ZONE,
  calendarDaysBetween,
  clockPartsIn,
  dayIn,
  formatInstant,
  isValidTimeZone,
  utcToZonedInput,
  zonedToUtc,
} from './tempo.ts';

const SP = 'America/Sao_Paulo';
const NY = 'America/New_York';

describe('isValidTimeZone', () => {
  it('aceita os nomes IANA', () => {
    assert.equal(isValidTimeZone(SP), true);
    assert.equal(isValidTimeZone('America/Manaus'), true);
  });

  it('aceita UTC, que não é nome canônico', () => {
    // `Intl.supportedValuesOf` recusaria; por isso a pergunta é ao formatador.
    assert.equal(isValidTimeZone('UTC'), true);
  });

  it('recusa o que não existe', () => {
    assert.equal(isValidTimeZone('America/Atlantis'), false);
    assert.equal(isValidTimeZone(''), false);
  });

  it('o padrão do Core é um fuso válido', () => {
    assert.equal(isValidTimeZone(DEFAULT_TIME_ZONE), true);
  });
});

describe('zonedToUtc — São Paulo, sem horário de verão', () => {
  it('14:30 em São Paulo é 17:30 UTC', () => {
    const instante = zonedToUtc('2026-09-24T14:30', SP);
    assert.equal(instante?.toISOString(), '2026-09-24T17:30:00.000Z');
  });

  it('aceita segundos quando vêm', () => {
    const instante = zonedToUtc('2026-09-24T14:30:45', SP);
    assert.equal(instante?.toISOString(), '2026-09-24T17:30:45.000Z');
  });

  it('meia-noite não escorrega para o dia seguinte', () => {
    // O caso do `hourCycle`: com `hour12: false` alguns runtimes dizem 24h,
    // e 24h reconstruído vira o dia seguinte — um dia de erro, todo dia.
    const instante = zonedToUtc('2026-09-24T00:00', SP);
    assert.equal(instante?.toISOString(), '2026-09-24T03:00:00.000Z');
  });

  it('recusa o que não é hora de parede', () => {
    for (const torto of ['', 'ontem', '2026-09-24', '24/09/2026 14:30', '2026-13-01T00:00']) {
      assert.equal(zonedToUtc(torto, SP), null, `${torto} deveria ser recusado`);
    }
  });

  it('recusa fuso que não existe, em vez de cair no do servidor', () => {
    assert.equal(zonedToUtc('2026-09-24T14:30', 'America/Atlantis'), null);
  });
});

describe('zonedToUtc — Nova York, onde o deslocamento muda', () => {
  it('em janeiro vale -05:00', () => {
    const instante = zonedToUtc('2026-01-15T12:00', NY);
    assert.equal(instante?.toISOString(), '2026-01-15T17:00:00.000Z');
  });

  it('em julho vale -04:00 — o mesmo relógio, outro instante', () => {
    const instante = zonedToUtc('2026-07-15T12:00', NY);
    assert.equal(instante?.toISOString(), '2026-07-15T16:00:00.000Z');
    // A prova de que o deslocamento não está numa constante: se estivesse,
    // um destes dois testes falharia.
  });

  it('uma hora antes de o relógio adiantar ainda é -05:00', () => {
    // 08/03/2026, 02:00 local, o relógio pula para 03:00.
    const instante = zonedToUtc('2026-03-08T01:30', NY);
    assert.equal(instante?.toISOString(), '2026-03-08T06:30:00.000Z');
  });

  it('uma hora depois já é -04:00', () => {
    const instante = zonedToUtc('2026-03-08T03:30', NY);
    assert.equal(instante?.toISOString(), '2026-03-08T07:30:00.000Z');
  });

  it('a hora que não existe cai na seguinte, em vez de sumir', () => {
    // 02:30 não aconteceu em 08/03/2026 em Nova York. Quem digitou não
    // escolheu aquele instante de propósito — recusar seria correto e inútil.
    const instante = zonedToUtc('2026-03-08T02:30', NY);
    assert.notEqual(instante, null);
    assert.equal(instante?.toISOString(), '2026-03-08T06:30:00.000Z');
  });

  it('na hora repetida do outono escolhe uma, e não falha', () => {
    // 01/11/2026 01:30 acontece duas vezes. Qualquer das duas serve; o que
    // não serve é `null` nem `Invalid Date`.
    const instante = zonedToUtc('2026-11-01T01:30', NY);
    assert.notEqual(instante, null);
    assert.ok(!Number.isNaN(instante?.getTime()));
  });
});

describe('ida e volta', () => {
  it('o que sai de zonedToUtc volta igual em utcToZonedInput', () => {
    for (const fuso of [SP, NY, 'UTC', 'America/Manaus', 'Europe/Lisbon']) {
      for (const parede of ['2026-01-15T12:00', '2026-07-15T12:00', '2026-09-24T00:00']) {
        const instante = zonedToUtc(parede, fuso);
        assert.notEqual(instante, null, `${fuso} ${parede}`);
        assert.equal(utcToZonedInput(instante as Date, fuso), parede, `${fuso} ${parede}`);
      }
    }
  });
});

describe('dayIn', () => {
  it('o mesmo instante é um dia em São Paulo e outro em Tóquio', () => {
    // 23:00 UTC = 20:00 em São Paulo (dia 24) e 08:00 em Tóquio (dia 25).
    const instante = new Date('2026-09-24T23:00:00Z');
    assert.equal(dayIn(instante, SP), '2026-09-24');
    assert.equal(dayIn(instante, 'Asia/Tokyo'), '2026-09-25');
  });
});

describe('calendarDaysBetween', () => {
  it('vinte e três horas cruzando a meia-noite são um dia, não zero', () => {
    // É a pergunta que a agenda faz: "é para amanhã?" — não "faltam 24h?".
    const hoje = zonedToUtc('2026-09-24T23:00', SP) as Date;
    const amanha = zonedToUtc('2026-09-25T22:00', SP) as Date;
    assert.equal(calendarDaysBetween(hoje, amanha, SP), 1);
  });

  it('o mesmo dia é zero, por mais distantes que estejam as horas', () => {
    const cedo = zonedToUtc('2026-09-24T00:01', SP) as Date;
    const tarde = zonedToUtc('2026-09-24T23:59', SP) as Date;
    assert.equal(calendarDaysBetween(cedo, tarde, SP), 0);
  });

  it('para trás é negativo', () => {
    const hoje = zonedToUtc('2026-09-24T12:00', SP) as Date;
    const ontem = zonedToUtc('2026-09-23T12:00', SP) as Date;
    assert.equal(calendarDaysBetween(hoje, ontem, SP), -1);
  });

  it('atravessar a virada do horário de verão continua contando dias', () => {
    // O dia de 23 horas. Dividir a diferença por 24h daria 0.
    const antes = zonedToUtc('2026-03-07T12:00', NY) as Date;
    const depois = zonedToUtc('2026-03-08T12:00', NY) as Date;
    assert.equal(calendarDaysBetween(antes, depois, NY), 1);
  });
});

describe('clockPartsIn', () => {
  it('lê os ponteiros do fuso pedido, não os do servidor', () => {
    const p = clockPartsIn(new Date('2026-09-24T17:30:00Z'), SP);
    assert.deepEqual(p, { year: 2026, month: 9, day: 24, hour: 14, minute: 30, second: 0 });
  });
});

describe('formatInstant', () => {
  it('mostra no fuso do cliente', () => {
    const texto = formatInstant(new Date('2026-09-24T17:30:00Z'), SP);
    assert.match(texto, /24\/09\/2026/);
    assert.match(texto, /14:30/);
  });
});

describe('Date.UTC normaliza em silêncio — e isto recusa', () => {
  /*
   * O defeito que estes travam não dá erro nenhum: `Date.UTC(2026, 12, 1)` é
   * janeiro de 2027, e `Date.UTC(2026, 1, 30)` é 2 de março. Sem a
   * conferência, uma data colada errada vira outra data plausível, gravada
   * sem aviso.
   */
  for (const impossivel of [
    '2026-13-01T00:00',
    '2026-00-10T00:00',
    '2026-01-32T00:00',
    '2026-02-30T00:00',
    '2025-02-29T00:00',
    '2026-09-24T25:00',
    '2026-09-24T12:60',
  ]) {
    it(`${impossivel} volta null`, () => {
      assert.equal(zonedToUtc(impossivel, SP), null);
    });
  }

  it('29 de fevereiro de ano bissexto continua valendo', () => {
    assert.notEqual(zonedToUtc('2028-02-29T12:00', SP), null);
  });
});
