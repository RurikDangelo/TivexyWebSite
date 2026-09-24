import { formatCents } from '@tivexy/core';

import { type SemanaDoFluxo, tetoDoFluxo } from '@/lib/erp/fluxo';

/**
 * Previsão de caixa por semana: barras agrupadas, duas séries.
 *
 * ## As cores não foram escolhidas no olho
 *
 * `--tvx-blue-500` (#2360d4) e `--tvx-danger-500` (#d9463a), as duas já do
 * sistema. Passaram nos seis testes do validador de paleta **nos dois temas**,
 * sobre branco e sobre `--tvx-navy-900`:
 *
 * | Teste                  | Resultado                            |
 * | ---------------------- | ------------------------------------ |
 * | Faixa de luminosidade  | passa nos dois temas                 |
 * | Piso de croma          | passa                                |
 * | Separação sob daltonia | ΔE 24,8 (protan) — folga confortável |
 * | Piso de visão normal   | ΔE 34,5                              |
 * | Contraste com o fundo  | ≥ 3:1                                |
 *
 * O par óbvio — verde e vermelho — **foi medido e recusado**: ΔE 8,0 no
 * deuteranopia, dentro da banda-piso que só valeria com codificação
 * secundária. Azul e vermelho dizem a mesma coisa e continuam legíveis para
 * quem não distingue verde de vermelho, que é cerca de um homem em doze.
 *
 * ## Um eixo só, e a escala é por barra
 *
 * Nunca dois eixos: as duas séries são da mesma unidade. E o teto é a **maior
 * barra**, não a soma — somar receber e pagar daria um teto que nenhuma barra
 * alcança, e todas ficariam achatadas na metade de baixo.
 *
 * ## A cor não é a única portadora
 *
 * Legenda sempre presente, rótulo direto só onde há movimento, `title` por
 * barra para o cursor, e a tabela equivalente logo abaixo — que é o que serve
 * a leitor de tela, à impressão e a quem quer copiar o número.
 *
 * ## Nenhum número inventado
 *
 * Toda barra é soma de linha de `finance_entries`. Sem lançamento em aberto,
 * o gráfico não aparece: quem chama mostra o estado vazio.
 */
export function CashFlowChart({ semanas }: { semanas: readonly SemanaDoFluxo[] }) {
  const teto = tetoDoFluxo(semanas);
  if (teto === 0) return null;

  return (
    <figure className="m-0">
      <figcaption className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="text-sm text-content-muted">
          O que vence nas próximas {semanas.length} semanas, ainda em aberto.
        </span>
        <span className="ml-auto flex items-center gap-3 text-xs">
          <Chave cor="var(--tvx-blue-500)" texto="A receber" />
          <Chave cor="var(--tvx-danger-500)" texto="A pagar" />
        </span>
      </figcaption>

      <div className="flex items-end gap-1.5 sm:gap-3">
        {semanas.map((semana, indice) => (
          <Coluna key={semana.inicio} semana={semana} teto={teto} indice={indice} />
        ))}
      </div>

      <details className="mt-4">
        <summary className="cursor-pointer text-xs text-content-muted hover:text-content">
          Ver os números em tabela
        </summary>
        <table className="mt-2 w-full text-sm">
          <caption className="sr-only">Previsão de caixa por semana, em aberto</caption>
          <thead>
            <tr className="border-b border-line-subtle text-left">
              <th scope="col" className="py-1 font-medium text-content-muted">
                Semana
              </th>
              <th scope="col" className="py-1 text-right font-medium text-content-muted">
                A receber
              </th>
              <th scope="col" className="py-1 text-right font-medium text-content-muted">
                A pagar
              </th>
            </tr>
          </thead>
          <tbody>
            {semanas.map((semana) => (
              <tr key={semana.inicio} className="border-b border-line-subtle last:border-b-0">
                <th scope="row" className="py-1 font-normal text-content">
                  {semana.rotulo}
                </th>
                <td className="py-1 text-right font-mono text-content">
                  {formatCents(semana.receberCents)}
                </td>
                <td className="py-1 text-right font-mono text-content">
                  {formatCents(semana.pagarCents)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

function Chave({ cor, texto }: { cor: string; texto: string }) {
  return (
    <span className="flex items-center gap-1.5 text-content-muted">
      {/* O quadrado carrega a identidade; o texto fica com cor de texto,
          nunca com a da série. */}
      <span aria-hidden className="size-2.5 rounded-[2px]" style={{ backgroundColor: cor }} />
      {texto}
    </span>
  );
}

/** A altura da barra em porcentagem do teto, com um piso visível. */
function altura(valor: number, teto: number): string {
  if (valor === 0) return '0%';
  /*
   * Piso de 2%: um lançamento de R$ 5,00 ao lado de um de R$ 50.000,00
   * desenharia uma barra de zero pixel, e o zero visual diria "não há nada"
   * sobre uma linha que existe.
   */
  return `${Math.max((valor / teto) * 100, 2)}%`;
}

function Coluna({ semana, teto, indice }: { semana: SemanaDoFluxo; teto: number; indice: number }) {
  const temMovimento = semana.receberCents > 0 || semana.pagarCents > 0;

  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
      {/*
        O rótulo direto só aparece onde há movimento. Um número sobre toda
        barra — inclusive as zeradas — é ruído que esconde justamente os
        valores que importam.
      */}
      <span className="h-4 truncate text-[0.625rem] font-medium text-content-muted">
        {temMovimento ? formatCents(Math.max(semana.receberCents, semana.pagarCents)) : ''}
      </span>

      {/* `items-end` ancora as barras na linha de base, que é o único lugar de
          onde uma barra pode nascer sem mentir sobre a proporção. */}
      <div className="flex h-32 w-full items-end justify-center gap-0.5">
        <Barra
          valor={semana.receberCents}
          teto={teto}
          cor="var(--tvx-blue-500)"
          titulo={`Semana de ${semana.rotulo} · a receber ${formatCents(semana.receberCents)}`}
          atraso={indice}
        />
        <Barra
          valor={semana.pagarCents}
          teto={teto}
          cor="var(--tvx-danger-500)"
          titulo={`Semana de ${semana.rotulo} · a pagar ${formatCents(semana.pagarCents)}`}
          atraso={indice}
        />
      </div>

      <span className="w-full truncate text-center text-[0.625rem] text-content-subtle">
        {semana.rotulo}
      </span>
    </div>
  );
}

function Barra({
  valor,
  teto,
  cor,
  titulo,
  atraso,
}: {
  valor: number;
  teto: number;
  cor: string;
  titulo: string;
  atraso: number;
}) {
  return (
    <div
      title={titulo}
      className="tvx-barra w-1/2 max-w-6 rounded-t-[4px] transition-opacity hover:opacity-80"
      style={{
        height: altura(valor, teto),
        backgroundColor: cor,
        /*
         * Escalonar por coluna dá a leitura da esquerda para a direita, que é
         * a ordem do tempo. A regra global de `prefers-reduced-motion` zera a
         * duração: quem pediu menos movimento vê as barras já no lugar.
         */
        animationDelay: `${atraso * 40}ms`,
      }}
    >
      <span className="sr-only">{titulo}</span>
    </div>
  );
}
