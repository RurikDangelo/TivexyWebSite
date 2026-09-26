'use client';

import type { TenantStatus } from '@tivexy/core';
import { useState, useTransition } from 'react';

import { Field, describedBy } from '@/components/form/field';
import { FormFeedback, FormMessage } from '@/components/form/messages';
import { AlertDialog } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/input';
import { desligarModulo, ligarModulo } from '@/lib/admin/modules';
import { MODULOS_INICIAL, type ModuloDoCliente, type ModulosState } from '@/lib/admin/state';

/*
 * Os módulos desta empresa, um interruptor cada.
 *
 * Duas informações diferentes convivem em cada linha e por isso são dois
 * sinais separados: **ligado** é o que a empresa alcança hoje; **do plano** é
 * o que ela contratou. Ligado fora do plano é cortesia, piloto ou migração —
 * o caso que `admin_set_tenant_module` existe para atender. Desligado dentro
 * do plano é o contrário, e é o que ninguém quer descobrir pelo suporte: está
 * pago e não chega.
 *
 * Ligar é imediato. Desligar pede motivo, porque tira acesso de gente que
 * está trabalhando e porque a auditoria guarda esse texto junto com quem fez
 * — é o que responde "por que o Estoque sumiu em outubro?".
 *
 * A frase que a interface repete em toda desativação é a garantia que a função
 * do banco dá: **desligar não apaga dado**. A linha de `tenant_modules` fica, o
 * acesso sai, religar devolve tudo.
 */

export interface ModuleTogglesProps {
  tenantId: string;
  /** A situação da empresa: em provisionamento, o banco recusa mexer nos módulos. */
  situacao: TenantStatus;
  modulos: readonly ModuloDoCliente[];
}

export function ModuleToggles({ tenantId, situacao, modulos }: ModuleTogglesProps) {
  const [estado, setEstado] = useState<ModulosState>(MODULOS_INICIAL);
  const [desligando, setDesligando] = useState<ModuloDoCliente | null>(null);
  const [emVoo, iniciar] = useTransition();

  /*
   * `admin_set_tenant_module` recusa empresa em provisionamento, de propósito:
   * o provisionamento ainda está escrevendo `tenant_modules`. A tela diz isso
   * antes, em vez de deixar o clique falhar.
   */
  const bloqueado = situacao === 'provisioning';

  function ligar(modulo: ModuloDoCliente) {
    const dados = new FormData();
    dados.set('id', tenantId);
    dados.set('modulo', modulo.codigo);
    iniciar(async () => {
      setEstado(await ligarModulo(estado, dados));
    });
  }

  async function desligar(dados: FormData) {
    setEstado(await desligarModulo(estado, dados));
  }

  return (
    <div className="flex flex-col gap-3">
      {bloqueado && (
        <FormMessage tom="warning">
          Empresa em provisionamento: os módulos ainda estão sendo escritos. Conclua ou desfaça o
          provisionamento antes de mexer aqui.
        </FormMessage>
      )}

      <ul className="flex flex-col divide-y divide-line-subtle">
        {modulos.map((modulo) => (
          <Linha
            key={modulo.codigo}
            modulo={modulo}
            bloqueado={bloqueado}
            emVoo={emVoo}
            estado={estado}
            aoLigar={() => ligar(modulo)}
            aoDesligar={() => setDesligando(modulo)}
          />
        ))}
      </ul>

      <p className="text-caption text-content-subtle">
        Desligar não apaga nada: o cadastro do módulo fica onde está, só o acesso sai. Religar
        devolve tudo, e toda mudança daqui entra na auditoria com o motivo.
      </p>

      <AlertDialog
        aberto={desligando !== null}
        aoFechar={() => setDesligando(null)}
        /* Reversível, e a tela diz por quê. O vermelho fica para o que não volta. */
        severidade="warning"
        titulo={`Desligar ${desligando?.nome ?? 'o módulo'}?`}
        descricao="Quem está na empresa perde o acesso ao módulo na próxima navegação. Os dados ficam onde estão, e religar devolve tudo."
        confirmarRotulo="Desligar"
        confirmarAction={desligar}
      >
        <input type="hidden" name="id" value={tenantId} />
        <input type="hidden" name="modulo" value={desligando?.codigo ?? ''} />
        <Field
          nome="modulo-motivo"
          rotulo="Motivo"
          obrigatorio
          dica="Fica na auditoria, junto com quem desligou e quando."
        >
          <Textarea
            id="modulo-motivo"
            name="motivo"
            required
            maxLength={500}
            rows={2}
            placeholder="Piloto encerrado; cliente não renovou o módulo."
            aria-describedby={describedBy(
              'modulo-motivo',
              undefined,
              'Fica na auditoria, junto com quem desligou e quando.',
            )}
          />
        </Field>
        {desligando?.noPlano === true && (
          <FormMessage tom="warning">
            Este módulo faz parte do plano atual. Desligar deixa a empresa pagando por algo que ela
            não alcança — trocar o plano costuma ser o que se quer.
          </FormMessage>
        )}
      </AlertDialog>
    </div>
  );
}

/** O que impede este módulo de ser mexido, ou `null` quando nada impede. */
function impedimento(modulo: ModuloDoCliente, bloqueado: boolean): string | null {
  if (bloqueado) return 'Empresa em provisionamento.';
  /*
   * O Core sustenta login, papéis e permissões: desligá-lo derruba a empresa
   * inteira e tranca do lado de fora quem religaria. A ação do servidor
   * recusa também — esta é a versão visível da mesma regra.
   */
  if (modulo.codigo === 'core')
    return 'O Core sustenta login, papéis e permissões. Não se desliga.';
  if (!modulo.emCatalogo && !modulo.ligado) return 'Módulo fora de catálogo: não dá para ligar.';
  return null;
}

function Linha({
  modulo,
  bloqueado,
  emVoo,
  estado,
  aoLigar,
  aoDesligar,
}: {
  modulo: ModuloDoCliente;
  bloqueado: boolean;
  emVoo: boolean;
  estado: ModulosState;
  aoLigar: () => void;
  aoDesligar: () => void;
}) {
  const id = `modulo-${modulo.codigo}`;
  const trava = impedimento(modulo, bloqueado);
  const desta = estado.codigo === modulo.codigo;

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <label htmlFor={id} className="flex flex-wrap items-center gap-2 text-label text-content">
          {modulo.nome}
          {modulo.noPlano ? (
            <Badge tone="brand" tamanho="xs">
              do plano
            </Badge>
          ) : (
            /* Avulso: ligado por decisão explícita, fora do que o plano dá. */
            <Badge tone="neutral" tamanho="xs">
              avulso
            </Badge>
          )}
          {modulo.noPlano && !modulo.ligado && (
            <Badge tone="warning" tamanho="xs">
              no plano e desligado
            </Badge>
          )}
          {!modulo.emCatalogo && (
            <Badge tone="neutral" tamanho="xs">
              fora de catálogo
            </Badge>
          )}
        </label>
        <p id={`${id}-nota`} className="text-caption text-content-subtle">
          {trava ??
            (modulo.ligado
              ? 'Ligado. Desligar pede motivo e não apaga dado.'
              : 'Desligado. Ligar libera o acesso na próxima navegação.')}
        </p>
        {desta && <FormFeedback estado={estado} />}
      </div>

      {/*
       * O motivo de estar travado é texto visível na nota acima, ligado por
       * `aria-describedby` — e não uma dica de ponteiro. Dica não existe no
       * toque, e "por que isto está desabilitado?" é a pergunta que mais
       * precisa de resposta em quem não usa mouse.
       */}
      <Switch
        id={id}
        checked={modulo.ligado}
        disabled={trava !== null || emVoo}
        aria-describedby={`${id}-nota`}
        onChange={() => (modulo.ligado ? aoDesligar() : aoLigar())}
      />
    </li>
  );
}
