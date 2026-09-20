/**
 * Todo blueprint do repositório é válido — e a prova roda a cada mudança.
 *
 * Este teste é o portão. Um documento de nicho não passa por revisão de tipo
 * (é JSON) nem por lint; sem ele, um blueprint com um módulo escrito errado só
 * apareceria no meio de um provisionamento real, com um tenant pela metade.
 *
 * Lê o diretório em vez de importar uma lista: assim um arquivo novo é coberto
 * por existir, não por alguém lembrar de registrá-lo.
 *
 * A leitura e a validação acontecem no escopo do módulo, **antes** de qualquer
 * teste rodar. Popular a lista de dentro de um `it` funcionaria hoje, mas
 * amarraria os testes de conjunto à ordem de execução — e no dia em que alguém
 * ligasse concorrência, eles passariam sobre uma lista vazia sem reclamar.
 *
 *   npm run test:core
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { type BlueprintCheck, checkBlueprint } from './blueprint.ts';

const DIR = fileURLToPath(new URL('../blueprints/', import.meta.url));

interface Documento {
  arquivo: string;
  /** O código esperado, vindo do nome do arquivo. */
  esperado: string;
  resultado: BlueprintCheck;
}

const documentos: Documento[] = readdirSync(DIR)
  .filter((f) => f.endsWith('.json'))
  .map((arquivo) => ({
    arquivo,
    esperado: basename(arquivo, '.json'),
    resultado: checkBlueprint(JSON.parse(readFileSync(join(DIR, arquivo), 'utf8')) as unknown),
  }));

/** Só os que passaram, para os testes de conjunto. */
const validos = documentos.flatMap((d) =>
  d.resultado.valid ? [{ ...d, bp: d.resultado.blueprint }] : [],
);

function porQue(resultado: BlueprintCheck): string {
  if (resultado.valid) return '';
  return resultado.problems.map((p) => `  ${p.path}: ${p.message}`).join('\n');
}

describe('cada blueprint do repositório', () => {
  it('existe mais de um', () => {
    // Mais de um, não "pelo menos um": com um blueprint só, o teste de que os
    // nichos diferem entre si não teria o que comparar e passaria em branco.
    assert.ok(documentos.length > 1, `esperava 2+ blueprints, achei ${documentos.length}`);
  });

  for (const { arquivo, esperado, resultado } of documentos) {
    describe(arquivo, () => {
      it('é válido', () => {
        assert.equal(resultado.valid, true, `${arquivo} inválido:\n${porQue(resultado)}`);
      });

      it('o nome do arquivo é o código do nicho', () => {
        // Se divergirem, achar o arquivo de um nicho vira busca por conteúdo —
        // e um código duplicado passaria despercebido.
        assert.equal(resultado.valid, true, `${arquivo} inválido:\n${porQue(resultado)}`);
        if (resultado.valid) assert.equal(resultado.blueprint.code, esperado);
      });
    });
  }
});

describe('o conjunto', () => {
  it('não há código de nicho repetido', () => {
    const codigos = validos.map((v) => v.bp.code);
    assert.equal(new Set(codigos).size, codigos.length);
  });

  it('todo nicho semeia alguma coisa', () => {
    // O cliente precisa encontrar dado no primeiro acesso, não uma tela vazia.
    // É a parte do valor que independe do nicho renomear coisas ou não.
    for (const { arquivo, bp } of validos) {
      assert.ok(bp.seeds.length > 0, `${arquivo} não semeia nada`);
    }
  });

  it('todo rótulo aponta para um módulo que o nicho habilita', () => {
    // Traduzir `crm.contacts` num nicho sem CRM é trabalho que ninguém vê —
    // e sinal de que o blueprint foi copiado de outro sem revisar.
    for (const { arquivo, bp } of validos) {
      for (const chave of Object.keys(bp.terms)) {
        const modulo = chave.split('.')[0];
        assert.ok(
          bp.modules.some((m) => m === modulo),
          `${arquivo}: traduz "${chave}", mas não habilita o módulo "${modulo}"`,
        );
      }
    }
  });

  it('os nichos de fato diferem entre si', () => {
    // O marco do ADR-003: dois nichos precisam produzir tenants diferentes. Se
    // todos habilitassem os mesmos módulos, o Blueprint não configuraria nada.
    const assinaturas = validos.map((v) => [...v.bp.modules].sort().join(','));
    assert.ok(assinaturas.length > 1, 'sem dois blueprints válidos, não há o que comparar');
    assert.ok(
      new Set(assinaturas).size > 1,
      'todos os blueprints habilitam exatamente os mesmos módulos',
    );
  });

  it('nenhum nicho é cópia de outro', () => {
    /*
     * A versão anterior deste teste exigia que todo nicho tivesse vocabulário
     * próprio, e estava errada: **nem todo nicho renomeia coisas.** Um mercado
     * chama produto de "produto" e cliente de "cliente" — ele é o caso
     * genérico, e o que o configura são as categorias, os papéis e as
     * configurações, não os rótulos. A regra antiga bloquearia um nicho
     * legítimo por não ter a forma que eu imaginei.
     *
     * O que o teste quer de fato é pegar **copiar e colar**: alguém duplica um
     * JSON, troca o nome e esquece de revisar o miolo. Então é isso que ele
     * mede — duas seções idênticas entre nichos diferentes.
     */
    for (const dimensao of ['terms', 'roles', 'seeds'] as const) {
      const vistos = new Map<string, string>();
      for (const { arquivo, bp } of validos) {
        const conteudo = JSON.stringify(bp[dimensao]);
        // Seção vazia é uma escolha legítima, não uma cópia.
        if (conteudo === '{}' || conteudo === '[]') continue;

        const anterior = vistos.get(conteudo);
        assert.equal(
          anterior,
          undefined,
          `${arquivo} tem "${dimensao}" idêntico a ${anterior} — copiado sem revisar?`,
        );
        vistos.set(conteudo, arquivo);
      }
    }
  });

  it('todo nicho difere do genérico em pelo menos duas dimensões', () => {
    // Um blueprint que só escolhe módulos seria um plano com outro nome. O
    // valor está em nascer configurado — e configurar acontece por rótulo,
    // papel, semente ou ajuste, em qualquer combinação.
    for (const { arquivo, bp } of validos) {
      const dimensoes = [
        Object.keys(bp.terms).length > 0,
        bp.roles.length > 0,
        bp.seeds.length > 0,
        Object.keys(bp.settings).length > 0,
      ].filter(Boolean).length;

      assert.ok(
        dimensoes >= 2,
        `${arquivo} quase não configura nada — seria um plano com outro nome`,
      );
    }
  });
});
