/**
 * O registro e o diretório não podem discordar.
 *
 * Um blueprint novo que ninguém registrou existe no repositório, passa no teste
 * de validade — e não aparece na tela de criar cliente. Nada falha; o nicho
 * simplesmente não é oferecido. Este teste é o que transforma esse silêncio em
 * erro.
 *
 *   npm run test:core
 */
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { basename } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { BLUEPRINTS, blueprintByCode } from './blueprint-registry.ts';
import { checkBlueprint } from './blueprint.ts';

const DIR = fileURLToPath(new URL('../blueprints/', import.meta.url));

const noDisco = readdirSync(DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => basename(f, '.json'))
  .sort();

describe('registro de blueprints', () => {
  it('registra exatamente os arquivos que existem', () => {
    assert.deepEqual(
      BLUEPRINTS.map((b) => b.code).sort(),
      noDisco,
      'um blueprint do diretório não está em blueprint-registry.ts, ou o contrário',
    );
  });

  it('o código de cada documento bate com o nome do arquivo', () => {
    for (const code of noDisco) {
      const bp = blueprintByCode(code);
      assert.notEqual(bp, null, `${code}.json não foi registrado`);
      assert.equal(bp?.code, code);
    }
  });

  it('todo blueprint registrado é válido contra o catálogo', () => {
    for (const bp of BLUEPRINTS) {
      const r = checkBlueprint(bp);
      assert.equal(r.valid, true, `${bp.code}: ${r.valid ? '' : JSON.stringify(r.problems)}`);
    }
  });

  it('código desconhecido devolve null em vez de lançar', () => {
    assert.equal(blueprintByCode('nicho-que-nao-existe'), null);
    assert.equal(blueprintByCode(''), null);
  });

  it('ignora caixa e espaço — o código vem de formulário', () => {
    assert.equal(blueprintByCode('  CAFETERIA  ')?.code, 'cafeteria');
  });
});
