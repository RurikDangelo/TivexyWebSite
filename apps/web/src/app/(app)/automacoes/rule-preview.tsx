'use client';

import { Badge } from '@/components/ui/badge';

export interface VariaveisDoEventoProps {
  variaveis: readonly string[];
  aoInserir: (variavel: string) => void;
}

/**
 * As variáveis que o evento entrega, como botões que escrevem no cursor.
 *
 * Botão e não lista de leitura: digitar `{{nome}}` à mão erra a chave sem
 * nenhum aviso, e a regra salva com um texto que nunca preenche.
 */
export function VariaveisDoEvento({ variaveis, aoInserir }: VariaveisDoEventoProps) {
  if (variaveis.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-caption text-content-subtle">Variáveis do evento:</span>
      {variaveis.map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => aoInserir(v)}
          aria-label={`Inserir a variável ${v}`}
          /* `min-h-6`: 24px de alvo mesmo com o texto de 11px do código. */
          className="inline-flex min-h-6 items-center rounded-control border border-line-subtle bg-surface-sunken px-1.5 font-mono text-caption text-content-muted transition-colors transition-base hover:border-line hover:text-content focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {`{{${v}}}`}
        </button>
      ))}
    </div>
  );
}

export interface PreviaDaMensagemProps {
  titulo: string;
  texto: string;
  /** A ação de criar atividade não tem corpo de mensagem, só assunto. */
  mostrarTexto: boolean;
}

/**
 * Como a mensagem ficaria — com valores de exemplo, nunca de um registro real.
 *
 * O selo `EXEMPLO` é obrigatório: sem ele a prévia passaria por um aviso que já
 * saiu, e a regra do repositório proíbe apresentar como real o que é simulado.
 */
export function PreviaDaMensagem({ titulo, texto, mostrarTexto }: PreviaDaMensagemProps) {
  if (titulo === '') return null;

  return (
    <div className="flex flex-col gap-1 rounded-control border border-dashed border-line bg-surface-sunken px-3 py-2">
      <p className="flex flex-wrap items-center gap-2 text-caption text-content-subtle">
        <Badge tone="mock" tamanho="xs">
          Exemplo
        </Badge>
        Prévia com valores de exemplo, não de um registro real
      </p>
      <p className="text-body font-medium break-words text-content">{titulo}</p>
      {mostrarTexto && texto !== '' && (
        <p className="text-body break-words text-content-muted">{texto}</p>
      )}
    </div>
  );
}
