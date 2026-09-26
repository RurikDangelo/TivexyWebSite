import { Page } from '@/components/page/page';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * O esqueleto do grupo autenticado — o que aparece enquanto qualquer rota sem
 * `loading.tsx` próprio busca os dados dela.
 *
 * Por que a forma é neutra, e não "a forma do conteúdo":
 *
 * Este arquivo serve 33 telas de quatro famílias diferentes (lista, painel,
 * detalhe, formulário). A versão anterior desenhava três cartões em
 * `md:grid-cols-3` dentro de `max-w-5xl`, e errava duas vezes: a largura
 * (22 telas eram `max-w-4xl`, 7 eram `max-w-3xl`, então o conteúdo encolhia
 * 128 ou 256px ao chegar) e o layout (nenhuma das 33 é uma grade de três
 * cartões). Prometer um layout específico para todas é garantir errar em
 * quase todas — pior que não prometer nada.
 *
 * O que sobra quando se tira o palpite: uma pilha vertical de blocos de
 * largura cheia. É a interseção honesta das quatro famílias — linha de tabela,
 * campo de formulário, faixa de seção e bloco de painel são todos isso antes
 * de se diferenciarem. Não promete coluna, não promete cartão, não promete
 * grade. Quem quiser precisão desenha o `loading.tsx` da própria rota, que é o
 * lugar onde a forma pode ser afirmada sem mentir.
 *
 * `variant="operacao"` (sem teto) pela mesma razão: o `<main>` já dá gutter e o
 * teto de `--content-max`, e um teto interno aqui reintroduziria o salto —
 * agora ao contrário, com o esqueleto mais estreito que a tela.
 *
 * Movimento: a varredura é do próprio `<Skeleton>` (`animate-shimmer`), já
 * coberta pelo bloco `prefers-reduced-motion` de `globals.css`. Nenhuma
 * animação de entrada aqui — atrasar o esqueleto é atrasar a única resposta
 * que a pessoa tem de que o clique foi registrado.
 */

/* Altura de `--text-h1` (24px × 1.2) e de `--text-body-lg` (16px), para o cabeçalho nascer do tamanho certo. */
const ALTURA_DO_TITULO = '1.8rem';
const ALTURA_DA_DESCRICAO = '1rem';

/*
 * 44px é a `linha-larga` da seção 5 e também a altura de um campo com respiro:
 * o mesmo bloco serve para os dois destinos possíveis.
 *
 * Dez blocos preenchem ~620px com o cabeçalho — o bastante para a tela não
 * encolher em 1080p e voltar a crescer quando o conteúdo chega.
 */
const ALTURA_DO_BLOCO = '2.75rem';
const BLOCOS = 10;

export default function Loading() {
  return (
    <Page variant="operacao">
      {/*
       * Um único anúncio para o carregamento inteiro. Todo `<Skeleton>` é
       * `aria-hidden`, então o leitor de tela recebe uma frase, não vinte.
       */}
      <div role="status" aria-busy="true">
        <span className="sr-only">Carregando o conteúdo desta tela</span>

        {/* `mb-5`: o mesmo respiro do `<PageHeader>`, que é o que vem no lugar. */}
        <div className="mb-5 flex flex-col gap-2">
          <Skeleton largura="14rem" altura={ALTURA_DO_TITULO} />
          <Skeleton largura="26rem" altura={ALTURA_DA_DESCRICAO} className="max-w-full" />
        </div>

        <div className="flex flex-col gap-3">
          {Array.from({ length: BLOCOS }, (_, i) => (
            <Skeleton key={i} altura={ALTURA_DO_BLOCO} raio="card" />
          ))}
        </div>
      </div>
    </Page>
  );
}
