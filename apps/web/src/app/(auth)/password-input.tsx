'use client';

import { ArrowBigUp, Eye, EyeOff } from 'lucide-react';
import { type KeyboardEvent, useState } from 'react';

import { Input, type InputProps } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export interface PasswordInputProps extends Omit<InputProps, 'type'> {
  /**
   * Avisa quando o Caps Lock está ligado.
   *
   * Só no campo de entrada. Numa tela cujo erro, por decisão contra enumeração
   * de contas (`actions.ts`), nunca pode dizer qual dos dois campos está errado,
   * o Caps Lock é a única pista honesta que dá para oferecer — e é a causa mais
   * comum de "minha senha está certa e não entra".
   */
  avisarCapsLock?: boolean;
}

/**
 * Campo de senha com olho e aviso de Caps Lock.
 *
 * `'use client'` como folha: o estado é o do próprio campo (visível ou não,
 * Caps Lock ligado ou não) e não sobe para a página. Quem monta o formulário
 * continua entregando `name`, `autoComplete` e `aria-describedby` — este
 * componente não sabe nada sobre o formulário em que está.
 *
 * O botão troca o `type` do mesmo input em vez de renderizar dois: um segundo
 * campo perderia o que já foi digitado e confundiria o gerenciador de senhas,
 * que é a defesa real contra senha fraca e reaproveitada.
 */
export function PasswordInput({
  avisarCapsLock = false,
  className,
  onKeyUp,
  onKeyDown,
  onBlur,
  ...props
}: PasswordInputProps) {
  const [visivel, setVisivel] = useState(false);
  const [capsLock, setCapsLock] = useState(false);

  /*
   * `getModifierState` só existe em evento de teclado — não há como saber o
   * estado do Caps Lock ao focar o campo. Por isso o aviso aparece na primeira
   * tecla, e não antes: inventar um estado inicial seria mentir metade das vezes.
   */
  function conferirCapsLock(evento: KeyboardEvent<HTMLInputElement>) {
    if (avisarCapsLock) setCapsLock(evento.getModifierState('CapsLock'));
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative">
        <Input
          {...props}
          type={visivel ? 'text' : 'password'}
          /* Espaço para o botão: sem isto a senha longa passa por baixo do olho. */
          className={cn('pr-11', className)}
          onKeyDown={(evento) => {
            conferirCapsLock(evento);
            onKeyDown?.(evento);
          }}
          onKeyUp={(evento) => {
            conferirCapsLock(evento);
            onKeyUp?.(evento);
          }}
          onBlur={(evento) => {
            /* Fora do campo o aviso não tem mais a quem servir. */
            setCapsLock(false);
            onBlur?.(evento);
          }}
        />

        <button
          type="button"
          onClick={() => setVisivel((atual) => !atual)}
          /*
           * `aria-pressed` e não um rótulo que muda sozinho: o botão é um
           * interruptor, e é assim que o leitor de tela anuncia o estado dele.
           * O rótulo ainda troca porque diz o que o próximo clique faz.
           */
          aria-pressed={visivel}
          aria-label={visivel ? 'Ocultar a senha' : 'Mostrar a senha'}
          /* 44px de alvo, bem acima dos 24px mínimos, e alinhado à altura do campo. */
          className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-control text-content-subtle transition-base hover:text-content"
        >
          {visivel ? (
            <EyeOff className="size-4" aria-hidden />
          ) : (
            <Eye className="size-4" aria-hidden />
          )}
        </button>
      </div>

      {capsLock && (
        /* `role="status"` e não `alert`: é uma pista, não um erro — não interrompe quem digita. */
        <p role="status" className="flex items-center gap-1.5 text-caption text-warning">
          <ArrowBigUp className="size-4 shrink-0" aria-hidden />
          Caps Lock está ligado.
        </p>
      )}
    </div>
  );
}
