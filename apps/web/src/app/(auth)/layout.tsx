import { Boxes, ShieldCheck, Tags } from 'lucide-react';

import { BrandSymbol, BrandWordmark } from '@/components/brand/logo';
import { ThemeToggle } from '@/components/theme-toggle';

/*
 * As telas de entrada não usam a casca do app: quem está aqui não tem sessão,
 * e um menu lateral cheio de links que levam de volta para o login seria só
 * ruído.
 *
 * Este grupo não chama `requireAccess()`. Suas rotas são `public` em
 * `routes.ts` — exigir sessão para entrar seria o laço mais óbvio possível.
 *
 * ## Por que duas colunas
 *
 * Era uma coluna de 384px num fundo vazio: num monitor de 1920px, 20% da
 * largura, mais estreita que qualquer tela interna, sem uma palavra sobre o que
 * é a Tivexy. O cliente que acabou de contratar abria o link e via um formulário
 * solto no branco. A partir de `lg` o formulário fica numa coluna de medida
 * própria (≈460px de cartão, que é largura de leitura, não de tela) e o resto
 * vira painel de marca. Abaixo de `lg` só o formulário existe: numa tela de
 * celular, marca ocupando meia dobra é marca no lugar do trabalho.
 */

/**
 * O que a coluna de marca afirma.
 *
 * Três afirmações, e as três são verificáveis hoje no código — é a regra do
 * CLAUDE.md valendo também para texto de venda:
 *
 *   base comum   `finance_on_sale_payment` (20260925100000_erp_finance.sql:288)
 *                cria a conta a receber no mesmo instante da venda
 *   isolamento   RLS em toda tabela, sem exceção (docs/PROJECT_STATE.md)
 *   vocabulário  `labelOf()`/`sectionTitle()` em `config/navigation.ts`
 *
 * Nada de emissão fiscal, WhatsApp ou pagamento aqui: nenhum dos três existe.
 */
const PROVAS = [
  {
    Icone: Boxes,
    titulo: 'CRM e ERP na mesma base',
    texto:
      'A venda registrada no balcão já nasce como conta a receber no financeiro. Ninguém reescreve o mesmo número duas vezes.',
  },
  {
    Icone: ShieldCheck,
    titulo: 'Cada empresa isolada no banco',
    texto:
      'O isolamento é política do PostgreSQL, conferida em toda consulta — não é filtro escrito na tela, que se esquece.',
  },
  {
    Icone: Tags,
    titulo: 'Os nomes são os do seu negócio',
    texto:
      'Uma clínica lê “pacientes” onde uma vidraçaria lê “clientes”, no menu e nas telas, sem sistema paralelo.',
  },
] as const;

export default function AuthLayout({ children }: LayoutProps<'/'>) {
  return (
    <div className="min-h-svh bg-surface-page lg:grid lg:grid-cols-[32rem_minmax(0,1fr)] xl:grid-cols-[34rem_minmax(0,1fr)]">
      <div className="flex min-h-svh flex-col gap-6 px-5 py-5 sm:px-8 sm:py-6 lg:px-10">
        <header className="flex items-center justify-between gap-4">
          {/*
           * Símbolo e wordmark com a mesma proporção 2:1 do `<Logo/>` da casca
           * logada (h-6/h-3), um degrau acima: a marca estava em h-6/h-3.5 —
           * proporção diferente da do componente E menor que o botão de tema ao
           * lado dela, na única tela em que ela é a única coisa que identifica
           * quem está pedindo a senha. O ideal é o `<Logo/>` aceitar tamanho;
           * `components/brand/` não é território desta onda.
           */}
          <span className="flex items-center gap-3 text-content">
            <BrandSymbol className="h-8" />
            <BrandWordmark className="h-4" label="Tivexy" />
          </span>
          <ThemeToggle />
        </header>

        <main className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-md">{children}</div>
        </main>

        {/*
         * Abaixo de `lg` o painel de marca não existe, e esta é a única frase
         * que diz o que a pessoa está abrindo. No desktop ela sobraria: a
         * coluna ao lado já diz o mesmo, com mais espaço.
         */}
        <p className="text-caption text-content-subtle lg:hidden">
          ERP, CRM e automação numa plataforma só, com cada empresa isolada no banco.
        </p>
      </div>

      {/*
       * Painel de marca. `bg-surface-brand` e não `--surface-inverse`: o
       * inverso vira BRANCO no tema escuro, e uma laje branca de altura inteira
       * ao lado de um formulário escuro é o oposto do que se pede a um tema
       * escuro. O azul da marca é o mesmo nos dois temas, e `--content-on-brand`
       * garante o texto por cima em ambos.
       */}
      <aside className="relative hidden overflow-hidden bg-surface-brand text-content-on-brand lg:flex lg:flex-col lg:justify-center lg:gap-6 lg:p-12 xl:p-16">
        {/* Profundidade: luz no alto à esquerda, sombra no canto oposto. Puramente decorativo. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_60%_at_10%_0%,rgb(255_255_255/0.16),transparent_60%),radial-gradient(70%_55%_at_100%_100%,rgb(4_9_26/0.4),transparent_65%)]"
        />
        {/* O símbolo como marca d'água. Sem `label`, sai da árvore de acessibilidade sozinho. */}
        <BrandSymbol className="pointer-events-none absolute -bottom-28 -right-24 h-[34rem] opacity-[0.07]" />

        <div className="relative">
          <p className="text-eyebrow uppercase text-content-on-brand/70">Plataforma Tivexy</p>
          {/*
           * `<h2>`, e não um `<p>` grande: o `<h1>` é o do cartão, que vem antes
           * no DOM. Quem navega por cabeçalhos alcança este painel; quem navega
           * por teclado só chega nele depois do formulário, que é a ordem certa.
           */}
          <h2 className="mt-4 text-display">Vender, controlar e acompanhar — no mesmo lugar.</h2>
          {/* `max-w-prose` no parágrafo, nunca no contêiner: é medida de leitura, não de tela. */}
          <p className="mt-4 max-w-prose text-body-lg text-content-on-brand/80">
            ERP e CRM sobre a mesma base, com as regras de acesso da sua empresa aplicadas no banco.
          </p>
        </div>

        <ul className="relative flex flex-col gap-4">
          {PROVAS.map(({ Icone, titulo, texto }) => (
            <li key={titulo} className="flex gap-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-card bg-[rgb(255_255_255/0.14)]">
                <Icone className="size-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <h3 className="text-h3">{titulo}</h3>
                <p className="mt-1 max-w-prose text-caption text-content-on-brand/80">{texto}</p>
              </div>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
