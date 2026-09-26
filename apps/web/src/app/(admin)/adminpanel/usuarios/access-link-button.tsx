'use client';

import { Copy, Link2 as LinkIcon } from 'lucide-react';
import { useState } from 'react';

import { Submit } from '@/components/form/submit';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';

import { gerarLinkDeAcesso } from '../access-link';
import { LINK_INICIAL, type AccessLinkState } from '../state';

/**
 * "Gerar link de acesso" de uma pessoa, por linha da lista.
 *
 * ## Por que esta tela existe
 *
 * Hoje o link só nasce na tela efêmera de sucesso de "Novo cliente" — e some
 * para sempre na primeira navegação. Se a pessoa perdeu o link, fechou a aba
 * ou trocou de e-mail, não havia caminho: o envio por e-mail depende de SMTP
 * próprio, que é dependência externa ainda pendente (o projeto Supabase usa o
 * servidor embutido, que só escreve para membros da equipe). Era um bloqueio
 * operacional sem saída pela interface.
 *
 * Nada aqui finge envio. A ação chama `generate_link` do Supabase, que devolve
 * o mesmo link que o e-mail carregaria **sem disparar nada**, e a tela diz
 * exatamente isso.
 *
 * ## O link é credencial
 *
 * Quem o abrir entra como aquela conta. Por isso:
 *
 * - ele não é gravado em lugar nenhum, não entra em log e vive só neste estado
 *   de componente — recarregar a página o perde, de propósito;
 * - aparece dentro de um diálogo modal, e não solto numa célula de tabela, para
 *   não ficar exposto no ombro de quem passa nem sobreviver a um print da
 *   lista inteira;
 * - a tela repete que ele vale uma vez e vence.
 *
 * A Server Action é chamada direto na `action` do formulário, e não por
 * `useActionState`: é o que dá `useFormStatus` de verdade ao `Submit` — o
 * dispatch de `useActionState` retorna na hora e o botão nunca ficaria
 * pendente. É o mesmo desenho de `failed-runs.tsx`.
 */
export function AccessLinkButton({ email, nome }: { email: string; nome: string }) {
  const [estado, setEstado] = useState<AccessLinkState>(LINK_INICIAL);
  const [aberto, setAberto] = useState(false);
  const { mostrar } = useToast();

  async function gerar(dados: FormData) {
    const resultado = await gerarLinkDeAcesso(dados);
    setEstado(resultado);
    /* Erro também abre: a mensagem do Supabase é o que explica por que não deu. */
    setAberto(true);
  }

  async function copiar(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      mostrar({ titulo: 'Link copiado', tom: 'sucesso' });
    } catch {
      /*
       * `clipboard` falha sem contexto seguro e quando a permissão é negada.
       * O link continua na tela para selecionar à mão — o que não pode é o
       * botão dizer "copiado" sem ter copiado.
       */
      mostrar({
        titulo: 'Não consegui copiar',
        descricao: 'Selecione o link na tela e copie à mão.',
        tom: 'aviso',
      });
    }
  }

  return (
    <>
      <form action={gerar}>
        <input type="hidden" name="email" value={email} />
        <Submit variant="outline" size="xs" pendente="Gerando…">
          <LinkIcon aria-hidden />
          Gerar link de acesso
        </Submit>
      </form>

      <Dialog
        aberto={aberto}
        aoFechar={() => {
          setAberto(false);
          /* O link não sobrevive ao fechar: reabrir tem de gerar outro. */
          setEstado(LINK_INICIAL);
        }}
        titulo={`Link de acesso de ${nome}`}
        descricao={`Nenhum e-mail foi enviado para ${email}. Repasse o link pelo canal que você já usa.`}
      >
        {estado.erro !== null ? (
          <p role="alert" className="text-body text-danger">
            {estado.erro}
          </p>
        ) : estado.link === null ? (
          <p className="text-body text-content-muted">Nada foi gerado.</p>
        ) : (
          <div className="flex flex-col gap-2">
            <code className="block w-full rounded-control border border-line-subtle bg-surface-sunken px-2 py-1.5 font-mono text-caption break-all text-content">
              {estado.link}
            </code>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void copiar(estado.link ?? '')}
              >
                <Copy aria-hidden />
                Copiar
              </Button>
            </div>

            <p className="text-caption text-warning">
              <strong className="font-semibold">É credencial.</strong> Quem abrir este endereço
              entra como {email}. Vale uma vez e vence. Ele não fica guardado em lugar nenhum: ao
              fechar esta janela, some daqui — e este botão gera outro quando precisar.
            </p>
          </div>
        )}
      </Dialog>
    </>
  );
}
