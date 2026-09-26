import { Page } from '@/components/page/page';
import { Skeleton, SkeletonRow } from '@/components/ui/skeleton';
import { TBody, TH, THead, Table } from '@/components/ui/table';

/** Quantas linhas o esqueleto promete. É a altura que a agenda costuma ocupar em 1080p. */
const LINHAS = 12;

/**
 * O carregamento da agenda, com a FORMA da agenda.
 *
 * Mesmo `<Page variant="operacao">` da rota — era o `loading.tsx` genérico de
 * `(app)`, em `max-w-5xl`, que fazia a tela encolher de 1024px para 896px e
 * voltar a cada navegação.
 *
 * O cabeçalho da tabela vem com o texto de verdade, e não com retângulos: ele
 * não depende do dado, então não há nada para adivinhar — e as colunas já
 * nascem com a largura final, que é o que impede o salto quando as linhas
 * chegam. As faixas ("Com atraso", "Hoje") ficam de fora de propósito: quantas
 * existem é resposta do banco, e desenhar três seria prometer três.
 */
export default function CarregandoAgenda() {
  return (
    <Page variant="operacao">
      {/* Um único anúncio para o carregamento inteiro: cada esqueleto é `aria-hidden`. */}
      <div role="status" aria-busy="true" className="flex flex-col gap-5">
        <span className="sr-only">Carregando a agenda…</span>

        <div className="flex flex-col gap-2">
          {/* `--text-h1`: 24px de título, 16px de linha de contexto. */}
          <Skeleton largura="14rem" altura="1.5rem" />
          <Skeleton largura="22rem" altura="1rem" />
        </div>

        {/* O trilho segmentado "Tudo / Sou responsável": 32px de altura, raio de pílula. */}
        <Skeleton largura="15rem" altura="2.25rem" raio="pill" />

        <Table densidade="larga" mobile="blocos" rotulo="Agenda de atividades, carregando">
          <THead>
            <tr role="row">
              <TH className="w-px">
                <span className="sr-only">Concluída</span>
              </TH>
              <TH>Assunto</TH>
              <TH className="w-44">Quando</TH>
              <TH className="w-32">Tipo</TH>
              <TH className="w-48">Sobre</TH>
              <TH className="w-40">Responsável</TH>
            </tr>
          </THead>
          <TBody>
            {Array.from({ length: LINHAS }, (_, i) => (
              <SkeletonRow key={i} colunas={6} densidade="larga" />
            ))}
          </TBody>
        </Table>
      </div>
    </Page>
  );
}
