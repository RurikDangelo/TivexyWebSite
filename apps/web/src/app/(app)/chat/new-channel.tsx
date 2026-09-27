'use client';

import { Hash, Lock, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useRef, useState } from 'react';

import { Field, describedBy } from '@/components/form/field';
import { FormError } from '@/components/form/messages';
import { Submit } from '@/components/form/submit';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toast';
import { criarCanal } from '@/lib/chat/actions';
import { CANAL_INICIAL, type CanalFormState } from '@/lib/chat/state';

/**
 * Criar canal.
 *
 * Em diálogo porque o formulário é curto e a lista atrás continua sendo a
 * referência — "já não existe um canal para isso?" é a primeira pergunta de
 * quem vai criar o segundo.
 *
 * A decisão que a tela precisa explicar é uma só: restrito **não se desfaz**.
 * O banco não deixa trocar `is_private` depois, e por um bom motivo — virar
 * público exporia um histórico escrito na expectativa de não ser lido por
 * todos. A frase está no campo, antes de marcar, e não num erro depois.
 */
export function NovoCanal() {
  const [aberto, setAberto] = useState(false);
  const [estado, acao] = useActionState(criarCanal, CANAL_INICIAL);
  const { mostrar } = useToast();
  const router = useRouter();

  /* Só a virada da rodada é sucesso; comparar `ok` reagiria a re-renderização. */
  const rodadaVista = useRef(estado.rodada);
  useEffect(() => {
    if (estado.rodada === rodadaVista.current) return;
    rodadaVista.current = estado.rodada;

    setAberto(false);
    mostrar({ tom: 'sucesso', titulo: estado.ok ?? 'Canal criado.' });
    /* Fechar antes de navegar: o diálogo vive no layout e sobreviveria à rota. */
    if (estado.criado !== null) router.push(`/chat/${estado.criado}`);
  }, [estado, mostrar, router]);

  return (
    <>
      <Button type="button" onClick={() => setAberto(true)}>
        <Plus aria-hidden />
        Novo canal
      </Button>

      <Dialog
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        titulo="Novo canal"
        descricao="Um assunto que a equipe repete merece um canal. Um assunto de uma semana, não."
      >
        <form action={acao} className="flex flex-col gap-4">
          {/* `key` na rodada limpa os campos depois de um cadastro que deu certo. */}
          <CamposDoCanal key={estado.rodada} estado={estado} />

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line-subtle pt-4">
            <Button type="button" variant="outline" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Submit pendente="Criando…">Criar canal</Submit>
          </div>
        </form>
      </Dialog>
    </>
  );
}

function CamposDoCanal({ estado }: { estado: CanalFormState }) {
  const [restrito, setRestrito] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      {estado.erro !== null && <FormError>{estado.erro}</FormError>}

      <Field
        nome="nome"
        rotulo="Nome do canal"
        obrigatorio
        escopo="novo-canal"
        dica="Uma palavra ou duas, em minúsculas. Dois canais com o mesmo nome não existem."
      >
        <Input
          id="novo-canal-nome"
          name="nome"
          required
          maxLength={80}
          autoComplete="off"
          placeholder="financeiro"
          aria-describedby={describedBy(
            'nome',
            undefined,
            'Uma palavra ou duas, em minúsculas. Dois canais com o mesmo nome não existem.',
            'novo-canal',
          )}
        />
      </Field>

      <Field
        nome="descricao"
        rotulo="Do que se fala aqui"
        escopo="novo-canal"
        dica="Aparece no topo da conversa. Ajuda quem entra depois a saber se é o lugar certo."
      >
        <Textarea
          id="novo-canal-descricao"
          name="descricao"
          rows={2}
          maxLength={280}
          placeholder="Fechamento, contas a pagar e conferência de caixa."
          aria-describedby={describedBy(
            'descricao',
            undefined,
            'Aparece no topo da conversa. Ajuda quem entra depois a saber se é o lugar certo.',
            'novo-canal',
          )}
        />
      </Field>

      <div className="flex items-start gap-3 rounded-control border border-line-subtle bg-surface-sunken p-3">
        <Switch
          id="novo-canal-restrito"
          name="restrito"
          value="sim"
          checked={restrito}
          onChange={(evento) => setRestrito(evento.target.checked)}
          aria-describedby="novo-canal-restrito-ajuda"
          className="mt-0.5"
        />
        <div className="flex min-w-0 flex-col gap-1">
          <label
            htmlFor="novo-canal-restrito"
            className="flex items-center gap-1.5 text-label text-content"
          >
            {restrito ? (
              <Lock className="size-3.5 shrink-0" aria-hidden />
            ) : (
              <Hash className="size-3.5 shrink-0" aria-hidden />
            )}
            Canal restrito
          </label>
          <p id="novo-canal-restrito-ajuda" className="text-caption text-pretty text-content-muted">
            {restrito
              ? 'Só quem for adicionado enxerga este canal e o histórico dele. Não dá para torná-lo público depois — quem precisar do outro modo cria outro canal.'
              : 'Aberto: toda pessoa ativa da empresa lê e escreve. Esta escolha é definitiva depois de criar.'}
          </p>
        </div>
      </div>
    </div>
  );
}
