/**
 * Testes do catálogo de configurações.
 *
 * O que estes testes protegem: que a lista não cresça sem critério, que o valor
 * efetivo de um tenant seja previsível, e que um blueprint não consiga ligar
 * configuração de módulo que o tenant não tem.
 *
 *   npm run test:core
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MODULE_CODES, type ModuleCode } from './catalog.ts';
import {
  TENANT_SETTINGS,
  checkSettingValue,
  overridesFrom,
  resolveSettings,
  settingDefinition,
} from './settings.ts';

describe('o catálogo', () => {
  it('toda chave é única', () => {
    const chaves = TENANT_SETTINGS.map((s) => s.key);
    assert.equal(new Set(chaves).size, chaves.length);
  });

  it('toda chave começa com o módulo a que pertence', () => {
    // Sem isso, `resolveSettings` não teria como saber que uma configuração
    // sai de cena quando o módulo não está habilitado — e a chave não diria
    // a quem pertence para quem estiver lendo o JSON de um tenant.
    for (const s of TENANT_SETTINGS) {
      assert.equal(s.key.split('.')[0], s.module, `${s.key} não começa com "${s.module}"`);
    }
  });

  it('todo módulo citado existe no catálogo', () => {
    const modulos = new Set<string>(MODULE_CODES);
    for (const s of TENANT_SETTINGS) {
      assert.ok(modulos.has(s.module), `${s.key} aponta para módulo inexistente`);
    }
  });

  it('todo padrão é um valor válido para a própria definição', () => {
    // Um padrão inválido é a pior classe de defeito aqui: o tenant nasce com
    // ele, nada reclama, e o erro só aparece quando alguém tenta salvar.
    for (const s of TENANT_SETTINGS) {
      assert.equal(checkSettingValue(s, s.default), null, `padrão de ${s.key} é inválido`);
    }
  });

  it('toda configuração explica para que serve', () => {
    for (const s of TENANT_SETTINGS) {
      assert.ok(
        s.description.trim().length > 15,
        `${s.key} não explica nada — quem vai configurar precisa entender`,
      );
    }
  });

  it('todo enum declara as opções', () => {
    for (const s of TENANT_SETTINGS.filter((s) => s.type === 'enum')) {
      assert.ok(s.options && s.options.length > 0, `${s.key} é enum sem opções`);
    }
  });
});

describe('validação de valor', () => {
  const booleana = settingDefinition('erp.sales_requires_customer');
  const moeda = settingDefinition('core.currency');
  const fuso = settingDefinition('core.timezone');

  it('as definições usadas nos testes existem', () => {
    assert.ok(booleana && moeda && fuso, 'o catálogo mudou — ajuste os testes junto');
  });

  it('booleana aceita só verdadeiro e falso', () => {
    assert.equal(checkSettingValue(booleana!, true), null);
    assert.equal(checkSettingValue(booleana!, false), null);
    for (const ruim of ['sim', 1, 0, null, undefined, {}]) {
      assert.match(checkSettingValue(booleana!, ruim) ?? '', /verdadeiro ou falso/);
    }
  });

  it('enum recusa fora das opções e diz quais são', () => {
    assert.equal(checkSettingValue(moeda!, 'BRL'), null);
    assert.match(checkSettingValue(moeda!, 'USD') ?? '', /BRL/);
  });

  it('fuso horário aceita apelido, não só nome canônico', () => {
    // `Intl.supportedValuesOf` devolve só os canônicos e recusaria `UTC`, que
    // é um fuso perfeitamente utilizável.
    for (const bom of ['America/Sao_Paulo', 'America/Manaus', 'UTC', 'Europe/Lisbon']) {
      assert.equal(checkSettingValue(fuso!, bom), null, `${bom} deveria valer`);
    }
    for (const ruim of ['America/Sao_Paulo_Errado', 'Brasilia', '']) {
      assert.notEqual(checkSettingValue(fuso!, ruim), null, `${ruim} não deveria valer`);
    }
  });

  it('texto vazio ou só espaço não conta como texto', () => {
    assert.notEqual(checkSettingValue(fuso!, '   '), null);
  });
});

describe('configurações efetivas de um tenant', () => {
  const todos = [...MODULE_CODES];

  it('sem nada informado, tudo fica no padrão', () => {
    const efetivas = resolveSettings({}, todos);
    for (const s of TENANT_SETTINGS) {
      assert.equal(efetivas[s.key], s.default, `${s.key} deveria estar no padrão`);
    }
  });

  it('o que o blueprint informa vence o padrão', () => {
    const efetivas = resolveSettings({ 'erp.sales_requires_customer': false }, todos);
    assert.equal(efetivas['erp.sales_requires_customer'], false);
  });

  it('configuração de módulo desabilitado nem aparece', () => {
    // Não aparece como `false`, nem como nada. Mostrá-la desligada sugeriria
    // que ligar resolveria alguma coisa — e não resolveria: o módulo não está
    // contratado.
    const efetivas = resolveSettings({}, ['core' as ModuleCode]);
    assert.equal('inventory.deduct_on_sale' in efetivas, false);
    assert.equal('erp.sales_requires_customer' in efetivas, false);
    assert.equal('core.currency' in efetivas, true);
  });

  it('valor inválido cai no padrão em vez de vazar para a interface', () => {
    // Este resultado alimenta a tela. Copiar uma chave com valor inválido faria
    // a interface exibir configuração que o sistema nunca vai ler.
    const efetivas = resolveSettings({ 'core.currency': 'USD' }, todos);
    assert.equal(efetivas['core.currency'], 'BRL');
  });

  it('chave desconhecida é ignorada, não copiada', () => {
    const efetivas = resolveSettings({ moeda: 'BRL', 'core.currency': 'BRL' }, todos);
    assert.equal('moeda' in efetivas, false);
  });

  it('informar a mesma coisa duas vezes não muda o resultado', () => {
    // Idempotência boba, mas é o que garante que reprovisionar um tenant com o
    // mesmo blueprint produza a mesma configuração.
    const uma = resolveSettings({ 'core.timezone': 'UTC' }, todos);
    const outra = resolveSettings({ 'core.timezone': 'UTC' }, todos);
    assert.deepEqual(uma, outra);
  });
});

describe('overridesFrom', () => {
  const todos = ['core', 'crm', 'erp', 'inventory'] as const;

  it('guarda só o que difere do padrão', () => {
    const r = overridesFrom(
      {},
      { 'core.timezone': 'America/Manaus', 'core.currency': 'BRL' },
      todos,
    );
    assert.ok(r.ok);
    assert.deepEqual(r.overrides, { 'core.timezone': 'America/Manaus' });
  });

  it('voltar ao padrão tira a chave — o padrão novo do Core volta a alcançar o tenant', () => {
    const r = overridesFrom(
      { 'core.timezone': 'America/Manaus' },
      { 'core.timezone': 'America/Sao_Paulo' },
      todos,
    );
    assert.ok(r.ok);
    assert.deepEqual(r.overrides, {});
  });

  it('a escolha de um módulo desligado sobrevive — o módulo pode voltar', () => {
    const r = overridesFrom(
      { 'inventory.deduct_on_sale': false },
      { 'core.timezone': 'America/Manaus' },
      ['core'],
    );
    assert.ok(r.ok);
    assert.deepEqual(r.overrides, {
      'inventory.deduct_on_sale': false,
      'core.timezone': 'America/Manaus',
    });
  });

  it('valor inválido recusa a gravação inteira, com o motivo por chave', () => {
    const r = overridesFrom(
      {},
      { 'core.timezone': 'Marte/Olympus', 'core.currency': 'USD' },
      todos,
    );
    assert.ok(!r.ok);
    assert.deepEqual(Object.keys(r.problems).sort(), ['core.currency', 'core.timezone']);
  });
});

describe('toda configuração se explica na tela', () => {
  it('tem rótulo e descrição, nenhum vazio', () => {
    for (const def of TENANT_SETTINGS) {
      assert.ok(def.label.trim().length > 0, `${def.key} sem rótulo`);
      assert.ok(def.description.trim().length > 0, `${def.key} sem descrição`);
    }
  });
});
