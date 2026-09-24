/**
 * Testes dos passos do tutorial.
 *
 * O que importa aqui é que a tela **não invente progresso**: passo marcado
 * como feito sem estar é pior que tutorial nenhum — a pessoa acha que já fez
 * e segue adiante sem o que o próximo passo precisa.
 *
 *   npm run test:web
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ESTADO_VAZIO, PASSOS, progresso, proximoPasso } from './passos.ts';

describe('o catálogo de passos', () => {
  it('todo passo tem título, o que fazer e por quê', () => {
    for (const passo of PASSOS) {
      assert.ok(passo.titulo.length > 0, passo.id);
      assert.ok(passo.oQueFazer.length > 10, `${passo.id}: o que fazer`);
      assert.ok(passo.porQue.length > 30, `${passo.id}: o porquê é o que ensina`);
    }
  });

  it('nenhum id se repete', () => {
    const ids = PASSOS.map((p) => p.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it('toda pendência traz um contorno', () => {
    /*
     * Pendência sem saída é bloqueio, e bloqueio no meio de um tutorial faz a
     * pessoa parar ali. Dizer "o e-mail não sai" sem dizer "use o link" é
     * metade da verdade — a metade inútil.
     */
    for (const passo of PASSOS) {
      if (passo.pendencia === undefined) continue;
      assert.ok(
        passo.pendencia.contorno.length > 20,
        `${passo.id}: a pendência não diz o que dá para fazer`,
      );
    }
  });

  it('as três dependências externas conhecidas estão declaradas', () => {
    /*
     * O briefing é explícito: o tutorial precisa DIZER o que ainda é externo,
     * em vez de fingir que o fluxo fecha. Este teste trava isso — se alguém
     * apagar a ressalva do e-mail, ele cai.
     */
    const tudo = PASSOS.map((p) => `${p.pendencia?.texto ?? ''} ${p.pendencia?.contorno ?? ''}`)
      .join(' ')
      .toLowerCase();

    assert.match(tudo, /e-mail/, 'falta dizer que o convite não sai por e-mail');
    assert.match(tudo, /fiscal/, 'falta dizer que não há emissão fiscal');
    assert.match(tudo, /whatsapp/, 'falta dizer que não há WhatsApp');
  });
});

describe('progresso', () => {
  it('cliente recém-criado tem só o passo da plataforma feito', () => {
    // O primeiro passo é "a empresa existe" — quem está lendo a tela logado
    // já passou por ele.
    const { feitos, total } = progresso(ESTADO_VAZIO);
    assert.equal(feitos, 1);
    assert.equal(total, PASSOS.length);
  });

  it('cliente com tudo feito tem todos os passos', () => {
    const cheio = {
      membrosAtivos: 1,
      leads: 1,
      contas: 1,
      atividades: 1,
      produtos: 1,
      movimentos: 1,
      vendasConfirmadas: 1,
      lancamentos: 1,
      automacoes: 1,
    };
    assert.equal(progresso(cheio).feitos, PASSOS.length);
  });

  it('cada contagem move exatamente um passo', () => {
    /*
     * Se duas contagens marcassem o mesmo passo, o progresso pularia — e um
     * salto no contador é o jeito mais rápido de fazer alguém desconfiar de
     * tudo que a tela diz.
     */
    const chaves = Object.keys(ESTADO_VAZIO) as (keyof typeof ESTADO_VAZIO)[];
    for (const chave of chaves) {
      const antes = progresso(ESTADO_VAZIO).feitos;
      const depois = progresso({ ...ESTADO_VAZIO, [chave]: 1 }).feitos;
      assert.equal(depois - antes, 1, `${chave} deveria mover exatamente um passo`);
    }
  });
});

describe('proximoPasso', () => {
  it('aponta o primeiro que falta', () => {
    assert.equal(proximoPasso(ESTADO_VAZIO)?.id, 'acesso');
  });

  it('volta ao passo pulado, em vez de empurrar para frente', () => {
    /*
     * Quem cadastrou produto sem ter cadastrado lead precisa ser levado de
     * volta ao lead: cada passo usa o que o anterior criou, e converter um
     * lead que não existe não tem como funcionar.
     */
    const pulou = { ...ESTADO_VAZIO, membrosAtivos: 1, produtos: 1 };
    assert.equal(proximoPasso(pulou)?.id, 'lead');
  });

  it('com tudo feito, não há próximo', () => {
    const cheio = {
      membrosAtivos: 1,
      leads: 1,
      contas: 1,
      atividades: 1,
      produtos: 1,
      movimentos: 1,
      vendasConfirmadas: 1,
      lancamentos: 1,
      automacoes: 1,
    };
    assert.equal(proximoPasso(cheio), null);
  });
});
