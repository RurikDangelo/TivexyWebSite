'use server';

/**
 * A marca de uma empresa: a cor e o logo.
 *
 * Tudo passa por `admin_set_tenant_brand` (20260926010000), que confere
 * `is_super_admin()`, trava a linha com `for update`, valida a cor e o caminho
 * do logo e grava a auditoria na mesma transação. A coluna não tem privilégio
 * de escrita direta — não há como gravar marca por fora desta função.
 *
 * **A função grava cor e logo juntos, sempre.** `brand_primary` recebe o que
 * chegar em `p_primary`, inclusive nulo: quem manda só o logo e esquece a cor
 * **apaga a cor**. Por isso `enviarLogo` e `removerLogo` leem a cor atual e a
 * devolvem intacta. É o preço de as duas serem uma decisão só — e a alternativa,
 * duas funções, renderia duas linhas de auditoria para uma mudança.
 *
 * **Por que o arquivo sobe pelo servidor, e não do navegador direto para o
 * balde.** A política do balde aceitaria o envio direto, e seria um salto a
 * menos. Mas aí o objeto e a coluna viram duas escritas independentes: se a
 * segunda falhar, fica um arquivo no balde que ninguém referencia e ninguém
 * vê. Aqui as duas moram na mesma função — quando a gravação falha, o objeto
 * recém-enviado é apagado; quando dá certo, o anterior é apagado. O arquivo
 * são 512 KB no máximo, então o salto extra custa pouco.
 */

import { BRAND_LOGO_BUCKET, brandLogoPath, checkBrandColor, checkBrandLogo } from '@tivexy/core';
import { revalidatePath } from 'next/cache';
import { notFound } from 'next/navigation';

import { requireAccess } from '@/lib/auth/require';
import { dbErrorMessage } from '@/lib/db-errors';
import { campo, isUuid } from '@/lib/ids';
import { supabaseServer } from '@/lib/supabase/server';

import { ADMIN_BASE, MARCA_INICIAL, type MarcaState } from './state';

/**
 * A guarda de toda ação daqui.
 *
 * `requireAccess` de novo em cada uma porque Server Action é endpoint: o
 * layout não roda na chamada de ação, e um `POST` direto ao id da ação nem
 * passa perto dele.
 *
 * A conferência de `isSuperAdmin` logo depois não é redundância decorativa.
 * `requireAccess` decide pela regra de prefixo de `config/routes.ts`, e o
 * casamento respeita fronteira de segmento — se o prefixo cadastrado ficar
 * para trás numa renomeação de rota, `ADMIN_BASE` cai na regra padrão
 * (`member`), que é **mais fraca**. Esta linha faz a falha ser 404, e não
 * acesso. Abaixo dela, a função do banco recusaria de todo jeito.
 */
async function porta(
  anterior: MarcaState,
  form: FormData,
): Promise<{ falha: MarcaState; id: string | null }> {
  const contexto = await requireAccess(ADMIN_BASE);
  if (!contexto.viewer.isSuperAdmin) notFound();

  const falha: MarcaState = { ...MARCA_INICIAL, rodada: anterior.rodada };
  const id = campo(form, 'id');
  return { falha, id: isUuid(id) ? id : null };
}

function pronto(anterior: MarcaState, id: string, ok: string): MarcaState {
  revalidatePath(`${ADMIN_BASE}/clientes/${id}`);
  revalidatePath(ADMIN_BASE);
  return { ...MARCA_INICIAL, ok, rodada: anterior.rodada + 1 };
}

/** Lê um campo de texto de um registro que o cliente do Supabase não tipa. */
function textoDe(registro: unknown, chave: string): string | null {
  if (typeof registro !== 'object' || registro === null) return null;
  const valor = (registro as Record<string, unknown>)[chave];
  return typeof valor === 'string' ? valor : null;
}

/**
 * A marca como está gravada hoje.
 *
 * Existe para que uma mudança de logo não apague a cor. Entre esta leitura e a
 * gravação cabe uma corrida, em tese — duas abas do mesmo Super Admin mexendo
 * na mesma empresa no mesmo segundo. Não vale uma transação por isso: só o
 * Super Admin escreve marca, o perdedor da corrida vê o resultado do outro na
 * revalidação, e a auditoria guarda o antes e o depois dos dois.
 */
async function marcaAtual(
  supabase: Awaited<ReturnType<typeof supabaseServer>>,
  id: string,
): Promise<{ cor: string | null; logo: string | null } | null> {
  const { data, error } = await supabase
    .from('tenants')
    .select('brand_primary, brand_logo_path')
    .eq('id', id)
    .maybeSingle();
  if (error !== null || data === null) return null;
  return { cor: textoDe(data, 'brand_primary'), logo: textoDe(data, 'brand_logo_path') };
}

/**
 * A cor principal do cliente.
 *
 * Campo vazio não é erro: é voltar ao azul da Tivexy, que é o que nulo
 * significa na coluna. O logo não é tocado — `p_logo_path` nulo com
 * `p_clear_logo` falso quer dizer "não mexe".
 */
export async function salvarCor(anterior: MarcaState, form: FormData): Promise<MarcaState> {
  const { falha, id } = await porta(anterior, form);
  if (id === null) return { ...falha, erro: 'Empresa não encontrada.' };

  const digitada = campo(form, 'cor');
  let cor: string | null = null;
  if (digitada !== '') {
    const conferida = checkBrandColor(digitada);
    if (!conferida.ok) return { ...falha, cor: conferida.error };
    cor = conferida.value;
  }

  const supabase = await supabaseServer();
  const { error } = await supabase.rpc('admin_set_tenant_brand', {
    p_tenant_id: id,
    p_primary: cor,
    p_logo_path: null,
    p_clear_logo: false,
  });
  if (error !== null) return { ...falha, erro: dbErrorMessage(error) };

  return pronto(
    anterior,
    id,
    cor === null
      ? 'Cor removida. A empresa volta ao azul da Tivexy.'
      : `Cor salva: ${cor}. Quem estiver com a tela aberta vê na próxima navegação.`,
  );
}

/** O que dizer quando o balde recusa o arquivo. */
function erroDeBalde(mensagem: string): string {
  const texto = mensagem.toLowerCase();
  if (texto.includes('mime') || texto.includes('content type')) {
    return 'O balde recusou o tipo do arquivo. Envie PNG, JPEG ou WebP.';
  }
  if (texto.includes('size') || texto.includes('large')) {
    return 'O balde recusou o tamanho: o limite é 512 KB.';
  }
  if (texto.includes('exists')) {
    return 'Já existe um arquivo neste caminho. Tente de novo.';
  }
  return 'Não consegui enviar o arquivo agora. Tente de novo em instantes.';
}

/**
 * Envia o logo e grava o caminho.
 *
 * A ordem importa: o arquivo sobe primeiro, porque a coluna não pode apontar
 * para um objeto que não existe. Se a gravação falhar depois, o objeto
 * recém-enviado é apagado — o inverso deixaria lixo público no balde.
 */
export async function enviarLogo(anterior: MarcaState, form: FormData): Promise<MarcaState> {
  const { falha, id } = await porta(anterior, form);
  if (id === null) return { ...falha, erro: 'Empresa não encontrada.' };

  const arquivo = form.get('arquivo');
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { ...falha, erro: 'Escolha um arquivo.' };
  }

  /* A mesma conferência da tela, de novo: a tela pode ser contornada. */
  const conferido = checkBrandLogo({ type: arquivo.type, size: arquivo.size });
  if (!conferido.ok) return { ...falha, erro: conferido.error };

  const supabase = await supabaseServer();
  const antes = await marcaAtual(supabase, id);
  if (antes === null) return { ...falha, erro: 'Empresa não encontrada.' };

  const caminho = brandLogoPath(id, conferido.extension, Date.now().toString(36));
  const balde = supabase.storage.from(BRAND_LOGO_BUCKET);

  const envio = await balde.upload(caminho, arquivo, {
    contentType: arquivo.type,
    /*
     * Um ano de cache, porque o caminho muda a cada envio: o objeto neste
     * endereço nunca é substituído, então guardá-lo para sempre é correto — e
     * é o que faz o logo do cliente não custar uma ida à rede em toda tela.
     */
    cacheControl: '31536000',
    upsert: false,
  });
  if (envio.error !== null) return { ...falha, erro: erroDeBalde(envio.error.message) };

  const { error } = await supabase.rpc('admin_set_tenant_brand', {
    p_tenant_id: id,
    p_primary: antes.cor,
    p_logo_path: caminho,
    p_clear_logo: false,
  });
  if (error !== null) {
    await balde.remove([caminho]);
    return { ...falha, erro: dbErrorMessage(error) };
  }

  /* O anterior só sai depois de a coluna já apontar para o novo. */
  if (antes.logo !== null && antes.logo !== caminho) await balde.remove([antes.logo]);

  return pronto(
    anterior,
    id,
    'Logo enviado. Ele aparece no acesso da empresa e na tela de entrada.',
  );
}

/**
 * Tira o logo e volta à marca da Tivexy.
 *
 * `p_clear_logo` existe exatamente para isto: nulo em `p_logo_path` significa
 * "não mexe", então sem a segunda bandeira não haveria como **tirar**.
 */
export async function removerLogo(anterior: MarcaState, form: FormData): Promise<MarcaState> {
  const { falha, id } = await porta(anterior, form);
  if (id === null) return { ...falha, erro: 'Empresa não encontrada.' };

  const supabase = await supabaseServer();
  const antes = await marcaAtual(supabase, id);
  if (antes === null) return { ...falha, erro: 'Empresa não encontrada.' };
  if (antes.logo === null) return { ...falha, erro: 'Esta empresa não tem logo.' };

  const { error } = await supabase.rpc('admin_set_tenant_brand', {
    p_tenant_id: id,
    p_primary: antes.cor,
    p_logo_path: null,
    p_clear_logo: true,
  });
  if (error !== null) return { ...falha, erro: dbErrorMessage(error) };

  /*
   * O objeto sai depois. Falha aqui não desfaz a remoção — a coluna já não
   * aponta para ele, então o que sobra é um arquivo órfão no balde, não um
   * logo que voltou a aparecer.
   */
  await supabase.storage.from(BRAND_LOGO_BUCKET).remove([antes.logo]);

  return pronto(anterior, id, 'Logo removido. A empresa volta a usar a marca da Tivexy.');
}
