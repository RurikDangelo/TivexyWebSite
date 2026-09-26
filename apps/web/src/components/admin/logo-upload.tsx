'use client';

import { BRAND_LOGO_ACCEPT, BRAND_LOGO_BUCKET, checkBrandLogo } from '@tivexy/core';
import { useActionState, useEffect, useState } from 'react';

import { Logo } from '@/components/brand/logo';
import { Field, describedBy } from '@/components/form/field';
import { FormFeedback, FormMessage } from '@/components/form/messages';
import { Submit } from '@/components/form/submit';
import { Button } from '@/components/ui/button';
import { AlertDialog } from '@/components/ui/dialog';
import { SectionLabel } from '@/components/ui/section-label';
import { enviarLogo, removerLogo } from '@/lib/admin/brand';
import { MARCA_INICIAL, type MarcaState } from '@/lib/admin/state';
import { supabaseBrowser } from '@/lib/supabase/client';

/*
 * O logo do cliente.
 *
 * As regras do balde aparecem **antes** do envio, não como erro depois dele:
 * PNG, JPEG ou WebP, até 512 KB, e SVG não entra. Dizer "formato inválido"
 * depois de a pessoa escolher um SVG é fazê-la descobrir a regra errando — e,
 * no caso do SVG, ela nem parece regra: é o formato mais natural para um logo,
 * e a razão de estar fora (balde público, SVG executa script) não é adivinhável.
 *
 * A conferência do arquivo é a mesma do servidor e a mesma do balde
 * (`checkBrandLogo`, no Core). Aqui ela existe para não gastar um envio
 * inteiro antes do não.
 */

export interface LogoUploadProps {
  tenantId: string;
  /** `tenants.brand_logo_path`, o caminho dentro do balde. `null` = marca da Tivexy. */
  logoPath: string | null;
  nomeDaEmpresa: string;
}

interface Escolhido {
  url: string;
  nome: string;
  kb: number;
}

export function LogoUpload({ tenantId, logoPath, nomeDaEmpresa }: LogoUploadProps) {
  const [estado, enviar] = useActionState(enviarLogo, MARCA_INICIAL);
  const [remocao, setRemocao] = useState<MarcaState>(MARCA_INICIAL);
  const [confirmando, setConfirmando] = useState(false);
  const [escolhido, setEscolhido] = useState<Escolhido | null>(null);
  const [recusa, setRecusa] = useState<string | null>(null);

  /*
   * O endereço público sai do caminho aqui, no cliente, porque é onde o
   * cliente do Supabase já está. `getPublicUrl` é cálculo de string — não faz
   * requisição — e o balde é público de propósito: o logo aparece na tela de
   * entrada da empresa, antes de existir sessão.
   */
  const urlAtual =
    logoPath === null
      ? null
      : supabaseBrowser().storage.from(BRAND_LOGO_BUCKET).getPublicUrl(logoPath).data.publicUrl;

  /*
   * O endereço temporário do arquivo escolhido é memória do navegador, e
   * devolvê-la é trabalho da limpeza deste efeito — não de quem troca o
   * arquivo. Trocar quatro vezes antes de enviar, sem isto, deixa quatro
   * arquivos presos até a aba fechar.
   */
  useEffect(() => {
    const url = escolhido?.url;
    return () => {
      if (url !== undefined) URL.revokeObjectURL(url);
    };
  }, [escolhido?.url]);

  function escolher(arquivo: File | null) {
    setEscolhido(null);
    setRecusa(null);
    if (arquivo === null) return;

    const conferido = checkBrandLogo({ type: arquivo.type, size: arquivo.size });
    if (!conferido.ok) {
      setRecusa(conferido.error);
      return;
    }
    setEscolhido({
      url: URL.createObjectURL(arquivo),
      nome: arquivo.name,
      kb: Math.max(1, Math.round(arquivo.size / 1024)),
    });
  }

  async function remover(dados: FormData) {
    setRemocao(await removerLogo(remocao, dados));
  }

  const regras = 'PNG, JPEG ou WebP, até 512 KB. SVG não é aceito.';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex flex-col gap-1.5">
          <SectionLabel>{escolhido === null ? 'Logo atual' : 'Vai ficar assim'}</SectionLabel>
          <div className="flex min-h-14 items-center rounded-card bg-surface-sunken px-4 py-3">
            {escolhido !== null ? (
              <Logo marca={{ url: escolhido.url, nome: nomeDaEmpresa }} tamanho="lg" />
            ) : urlAtual !== null ? (
              <Logo marca={{ url: urlAtual, nome: nomeDaEmpresa }} tamanho="lg" />
            ) : (
              /* Sem logo do cliente, o que a empresa vê é a marca da Tivexy — e é o que a prévia mostra. */
              <Logo tamanho="lg" />
            )}
          </div>
          {escolhido === null && urlAtual === null && (
            <p className="text-caption text-content-subtle">
              Sem logo próprio: a empresa usa a marca da Tivexy.
            </p>
          )}
          {escolhido !== null && (
            <p className="text-caption text-content-subtle">
              {escolhido.nome} · {escolhido.kb} KB · ainda não enviado
            </p>
          )}
        </div>

        <form action={enviar} className="flex min-w-60 flex-1 flex-col gap-3">
          <input type="hidden" name="id" value={tenantId} />
          <Field nome="marca-logo" rotulo="Enviar logo" erro={recusa ?? undefined} dica={regras}>
            <input
              /* A `key` troca a cada envio concluído e devolve o campo vazio: o nome do arquivo já enviado ficaria ali sugerindo que falta enviar. */
              key={estado.rodada}
              id="marca-logo"
              name="arquivo"
              type="file"
              accept={BRAND_LOGO_ACCEPT}
              onChange={(ev) => escolher(ev.target.files?.[0] ?? null)}
              aria-invalid={recusa !== null}
              aria-describedby={describedBy('marca-logo', recusa ?? undefined, regras)}
              className="block w-full text-body text-content-default file:mr-3 file:cursor-pointer file:rounded-control file:border file:border-line-strong file:bg-surface file:px-3 file:py-1.5 file:text-label file:text-content hover:file:bg-surface-subtle"
            />
          </Field>

          <div className="flex flex-wrap items-center gap-3">
            <Submit variant="outline" pendente="Enviando…" disabled={escolhido === null}>
              Enviar logo
            </Submit>
            {logoPath !== null && (
              <Button type="button" variant="ghost" onClick={() => setConfirmando(true)}>
                Remover logo
              </Button>
            )}
          </div>
        </form>
      </div>

      {/* Erro de envio ganha do sucesso da remoção, e vice-versa: um de cada vez, como no resto do app. */}
      <FormFeedback estado={{ erro: estado.erro ?? remocao.erro, ok: estado.ok ?? remocao.ok }} />

      <FormMessage tom="neutral" anuncio="status">
        SVG está fora por segurança, não por esquecimento: o balde é de leitura pública, e um SVG
        servido de lá pode executar script na origem do projeto. Um PNG ou WebP a 2x resolve um logo
        de 32 px.
      </FormMessage>

      <AlertDialog
        aberto={confirmando}
        aoFechar={() => setConfirmando(false)}
        /* Reversível: é só enviar de novo. O vermelho fica para o que não volta. */
        severidade="warning"
        titulo={`Remover o logo de ${nomeDaEmpresa}?`}
        descricao="A empresa volta a usar a marca da Tivexy nas telas e no acesso. O arquivo sai do balde, então enviar de novo exige ter o original."
        confirmarRotulo="Remover logo"
        confirmarAction={remover}
      >
        <input type="hidden" name="id" value={tenantId} />
      </AlertDialog>
    </div>
  );
}
