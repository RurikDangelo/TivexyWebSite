/**
 * Testes dos contratos do provisionamento.
 *
 * São três funções pequenas, e a tentação é não testá-las. Mas cada uma
 * duplica uma regra que o banco também expressa — e duplicação sem conferência
 * é como as duas versões silenciosamente divergem. A conferência contra o SQL
 * está em `supabase/tests/contracts.test.mjs`; aqui ficam as propriedades que
 * não dependem de banco nenhum.
 *
 *   npm run test:core
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  PROVISIONING_STATUSES,
  PROVISIONING_STEPS,
  type ProvisioningStatus,
  isActive,
  isTerminal,
  progressOf,
} from './provisioning.ts';

describe('estados terminais', () => {
  it('terminal é exatamente succeeded, failed e compensated', () => {
    const terminais = PROVISIONING_STATUSES.filter(isTerminal);
    assert.deepEqual([...terminais], ['succeeded', 'failed', 'compensated']);
  });

  it('compensating não é terminal — está desfazendo, ainda não terminou', () => {
    // Não é detalhe: o esquema exige `finished_at` nos terminais e o proíbe
    // nos demais. Errar aqui produz estado que o banco recusa.
    assert.equal(isTerminal('compensating'), false);
    assert.equal(isActive('compensating'), true);
  });

  it('todo estado é terminal ou está vivo, nunca os dois', () => {
    for (const status of PROVISIONING_STATUSES) {
      assert.notEqual(
        isTerminal(status),
        isActive(status),
        `${status} precisa ser exatamente um dos dois`,
      );
    }
  });

  it('os estados vivos são os que ocupam o tenant', () => {
    const vivos = PROVISIONING_STATUSES.filter(isActive);
    assert.deepEqual([...vivos], ['pending', 'running', 'compensating']);
  });
});

describe('progresso', () => {
  it('vai de 0 a 1 ao longo das etapas', () => {
    assert.equal(progressOf(0), 0);
    assert.equal(progressOf(PROVISIONING_STEPS.length), 1);
  });

  it('cresce sem voltar', () => {
    let anterior = -1;
    for (let feitas = 0; feitas <= PROVISIONING_STEPS.length; feitas += 1) {
      const atual = progressOf(feitas);
      assert.ok(atual > anterior, `${feitas} etapas deveria progredir`);
      anterior = atual;
    }
  });

  it('não estoura o limite quando a contagem vem errada', () => {
    // A contagem vem do banco. Se um dia uma etapa nova entrar sem atualizar
    // PROVISIONING_STEPS, a barra passaria de 100% — melhor recortar do que
    // mostrar "117% concluído".
    assert.equal(progressOf(PROVISIONING_STEPS.length + 3), 1);
    assert.equal(progressOf(Number.MAX_SAFE_INTEGER), 1);
  });

  it('não fica negativo', () => {
    assert.equal(progressOf(-1), 0);
    assert.equal(progressOf(-999), 0);
  });
});

describe('etapas', () => {
  it('a ordem é parte do contrato', () => {
    assert.deepEqual(
      [...PROVISIONING_STEPS],
      [
        'create_tenant',
        'apply_plan',
        'enable_modules',
        'create_roles',
        'create_admin',
        'seed_defaults',
        'send_invite',
      ],
    );
  });

  it('o tenant nasce antes de qualquer coisa depender dele', () => {
    const posicao = (step: string) => PROVISIONING_STEPS.indexOf(step as never);
    assert.equal(posicao('create_tenant'), 0);
    assert.ok(posicao('create_admin') > posicao('enable_modules'), 'o admin precisa dos módulos');
    assert.ok(
      posicao('send_invite') > posicao('create_admin'),
      'não se convida alguém que ainda não existe',
    );
  });

  it('não há etapa repetida', () => {
    assert.equal(new Set(PROVISIONING_STEPS).size, PROVISIONING_STEPS.length);
  });
});

describe('estados desconhecidos', () => {
  it('um estado fora do enum não conta como terminal', () => {
    // Vindo do banco via JSON, nada garante que o valor está no enum. Tratar
    // desconhecido como "ainda vivo" é o lado seguro: a execução continua
    // ocupando o tenant em vez de liberar o lugar para outra.
    const desconhecido = 'quem_sabe' as ProvisioningStatus;
    assert.equal(isTerminal(desconhecido), false);
    assert.equal(isActive(desconhecido), true);
  });
});
