'use client';

import { useEffect, useRef } from 'react';

import { moverOportunidade } from './actions';

/**
 * Arrastar entre etapas, por cima do quadro que já funcionava.
 *
 * ## Melhoria progressiva de verdade, não fachada
 *
 * O quadro é renderizado no servidor e cada cartão já tem um `select` com
 * "Mover para…" — esse é o caminho **principal**, não o de acessibilidade.
 * Ele funciona sem JavaScript, funciona no teclado, funciona com leitor de
 * tela e funciona no celular, onde arrastar entre colunas empilhadas é um
 * gesto que ninguém acerta.
 *
 * Arrastar é o atalho de quem está no computador com o mouse na mão. Se este
 * arquivo não carregar, ninguém fica sem poder mover nada.
 *
 * ## Por que delegação de evento, e não cartão-componente-cliente
 *
 * Transformar cada cartão em componente de cliente mandaria para o navegador
 * o título, o valor e o nome da conta de cada oportunidade — duas vezes, uma
 * no HTML e outra no payload do React. Aqui o quadro continua inteiro no
 * servidor: o cliente só escuta o contêiner e lê `data-*` do alvo do evento.
 *
 * ## Por que um `form` escondido, e não `fetch`
 *
 * O arrastar **chama a mesma Server Action** que o `select` chama. Um segundo
 * caminho de escrita seria um segundo lugar para esquecer a checagem de
 * permissão, o `tenant_id` no `where` e a conferência da etapa de destino.
 * Há um caminho só; arrastar apenas preenche o formulário e o envia.
 */
export function ArrastarNoQuadro({ children }: { children: React.ReactNode }) {
  const area = useRef<HTMLDivElement>(null);
  const formulario = useRef<HTMLFormElement>(null);
  const campoId = useRef<HTMLInputElement>(null);
  const campoDe = useRef<HTMLInputElement>(null);
  const campoPara = useRef<HTMLInputElement>(null);

  /*
   * O que está sendo arrastado fica em `ref`, e o destaque da coluna é
   * atributo no DOM — nada disso passa por estado do React.
   *
   * `dragover` dispara a cada movimento do cursor. Guardar a coluna sob o
   * mouse em `useState` re-renderizaria o quadro inteiro dezenas de vezes por
   * segundo, e o quadro tem uma lista por etapa. Um `data-sobre` ligado e
   * desligado no elemento custa nada, e o CSS faz o resto.
   */
  const arrastando = useRef<{ id: string; de: string } | null>(null);

  useEffect(() => {
    const raiz = area.current;
    if (raiz === null) return;

    const cartaoDe = (alvo: EventTarget | null): HTMLElement | null =>
      alvo instanceof Element ? alvo.closest<HTMLElement>('[data-oportunidade]') : null;

    const colunaDe = (alvo: EventTarget | null): HTMLElement | null =>
      alvo instanceof Element ? alvo.closest<HTMLElement>('[data-coluna]') : null;

    /** Apaga o destaque de todas as colunas. Chamado em todo fim de arrasto. */
    function limparDestaque() {
      for (const coluna of raiz!.querySelectorAll<HTMLElement>('[data-sobre]')) {
        delete coluna.dataset.sobre;
      }
    }

    function aoComecar(evento: DragEvent) {
      const cartao = cartaoDe(evento.target);
      const id = cartao?.dataset.oportunidade;
      const de = cartao?.dataset.etapa;
      if (cartao === null || id === undefined || de === undefined) return;

      arrastando.current = { id, de };
      cartao.dataset.arrastando = 'sim';

      /*
       * Mesmo sem usar o conteúdo, `setData` precisa ser chamado: sem ele o
       * Firefox não inicia o arrasto. É o tipo de detalhe que faz o recurso
       * funcionar no Chrome e simplesmente não existir no Firefox.
       */
      evento.dataTransfer?.setData('text/plain', id);
      if (evento.dataTransfer !== null) evento.dataTransfer.effectAllowed = 'move';
    }

    function aoTerminar(evento: DragEvent) {
      const cartao = cartaoDe(evento.target);
      if (cartao !== null) delete cartao.dataset.arrastando;
      arrastando.current = null;
      limparDestaque();
    }

    function aoPassarPorCima(evento: DragEvent) {
      if (arrastando.current === null) return;

      const coluna = colunaDe(evento.target);
      if (coluna === null || coluna.dataset.coluna === undefined) return;

      /* Sem `preventDefault` o navegador recusa a soltura: o padrão é não aceitar. */
      evento.preventDefault();
      if (evento.dataTransfer !== null) evento.dataTransfer.dropEffect = 'move';

      if (coluna.dataset.sobre === undefined) {
        limparDestaque();
        coluna.dataset.sobre = 'sim';
      }
    }

    function aoSoltar(evento: DragEvent) {
      const movido = arrastando.current;
      const para = colunaDe(evento.target)?.dataset.coluna;

      arrastando.current = null;
      limparDestaque();
      if (movido === undefined || movido === null || para === undefined) return;

      evento.preventDefault();

      /* Soltar na mesma coluna não é engano nem operação: é um não-evento. */
      if (para === movido.de) return;

      if (campoId.current === null || campoDe.current === null || campoPara.current === null) {
        return;
      }
      campoId.current.value = movido.id;
      campoDe.current.value = movido.de;
      campoPara.current.value = para;
      formulario.current?.requestSubmit();
    }

    /* Sair da área sem soltar precisa apagar o destaque, senão ele fica aceso. */
    function aoSair(evento: DragEvent) {
      if (!raiz!.contains(evento.relatedTarget as Node | null)) limparDestaque();
    }

    raiz.addEventListener('dragstart', aoComecar);
    raiz.addEventListener('dragend', aoTerminar);
    raiz.addEventListener('dragover', aoPassarPorCima);
    raiz.addEventListener('drop', aoSoltar);
    raiz.addEventListener('dragleave', aoSair);

    return () => {
      raiz.removeEventListener('dragstart', aoComecar);
      raiz.removeEventListener('dragend', aoTerminar);
      raiz.removeEventListener('dragover', aoPassarPorCima);
      raiz.removeEventListener('drop', aoSoltar);
      raiz.removeEventListener('dragleave', aoSair);
    };
  }, []);

  return (
    <div ref={area} className="contents">
      {/*
        O mesmo destino do `select` de cada cartão. Um caminho de escrita só:
        dois seriam dois lugares para esquecer a checagem de permissão.
      */}
      <form ref={formulario} action={moverOportunidade} className="hidden">
        <input ref={campoId} type="hidden" name="id" />
        <input ref={campoDe} type="hidden" name="de" />
        <input ref={campoPara} type="hidden" name="para" />
      </form>
      {children}
    </div>
  );
}
