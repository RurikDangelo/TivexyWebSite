import { Check } from 'lucide-react';

import { Submit } from '@/components/form/submit';
import { Badge } from '@/components/ui/badge';
import { TD, TR } from '@/components/ui/table';
import { Tooltip } from '@/components/ui/tooltip';
import { formatInstant } from '@/lib/format';
import { atrasoDaLinha, cn } from '@/lib/utils';

import { abrirAviso, marcarComoLido } from './actions';

export interface Aviso {
  id: string;
  titulo: string;
  texto: string | null;
  temLink: boolean;
  quando: string;
  lido: boolean;
}

/** Situação, aviso, quando e a ação. O vazio da tabela precisa do mesmo número. */
export const COLUNAS_DE_AVISOS = 4;

export interface LinhaDeAvisoProps {
  aviso: Aviso;
  /** Fuso do tenant: a hora de um aviso é a hora de quem trabalha nele. */
  fuso: string;
  animar?: boolean;
  indice: number;
}

/**
 * Um aviso, em forma de linha.
 *
 * O não lido tem selo, peso e a palavra "Não lido" — a cor não carrega o
 * estado sozinha. O lido continua dizendo que é lido, em vez de simplesmente
 * perder o ponto: ausência não é informação.
 */
export function LinhaDeAviso({ aviso, fuso, animar = false, indice }: LinhaDeAvisoProps) {
  const enfase = aviso.lido ? 'text-content-muted' : 'font-medium text-content';

  return (
    <TR
      className={animar ? 'animate-enter' : undefined}
      style={animar ? { animationDelay: atrasoDaLinha(indice) } : undefined}
    >
      <TD rotulo="Situação">
        {aviso.lido ? (
          <span className="text-caption text-content-subtle">Lido</span>
        ) : (
          <Badge tone="brand" Icone={null}>
            Não lido
          </Badge>
        )}
      </TD>

      {/* Sem `rotulo`: é a célula do registro, e no modo blocos ela quer a largura inteira. */}
      <TD>
        <span className="flex min-w-0 flex-col gap-0.5">
          {aviso.temLink ? (
            /*
             * Abrir é escrita (marca como lido), então é formulário e não link:
             * o navegador pré-carrega link, e o aviso ficaria lido sem ninguém
             * ter olhado. Ver `abrirAviso` em `actions.ts`.
             */
            <form action={abrirAviso}>
              <input type="hidden" name="id" value={aviso.id} />
              <button
                type="submit"
                className={cn(
                  'text-left text-body break-words underline-offset-2 transition-base hover:underline',
                  enfase,
                )}
              >
                {aviso.titulo}
              </button>
            </form>
          ) : (
            <span className={cn('text-body break-words', enfase)}>{aviso.titulo}</span>
          )}

          {aviso.texto !== null && (
            <span className="text-caption break-words text-pretty text-content-muted">
              {aviso.texto}
            </span>
          )}
        </span>
      </TD>

      <TD rotulo="Quando" className="text-num whitespace-nowrap text-content-muted">
        <time dateTime={aviso.quando}>{formatInstant(aviso.quando, fuso)}</time>
      </TD>

      <TD acoes>
        {!aviso.lido && (
          <form action={marcarComoLido}>
            <input type="hidden" name="id" value={aviso.id} />
            {/*
             * `Tooltip` no lugar do `title=` nativo: o `title` só aparece no
             * ponteiro, demora um segundo e nunca chega a quem navega por
             * teclado — justamente num botão que só tem ícone.
             */}
            <Tooltip conteudo="Marcar como lido">
              <Submit
                variant="ghost"
                size="icon-sm"
                pendente=""
                aria-label={`Marcar como lido: ${aviso.titulo}`}
              >
                <Check aria-hidden />
              </Submit>
            </Tooltip>
          </form>
        )}
      </TD>
    </TR>
  );
}
