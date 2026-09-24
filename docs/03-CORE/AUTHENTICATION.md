# Autenticação e sessão

> Como uma requisição vira um `Viewer`. Quem pode o quê está em
> [[../12-SECURITY/AUTHORIZATION|AUTHORIZATION]]; o isolamento entre empresas,
> em [[../12-SECURITY/MULTI_TENANCY|MULTI_TENANCY]].

## Três camadas, e nenhuma delas sozinha

| Camada            | Decide                                    | Por que não basta                                           |
| ----------------- | ----------------------------------------- | ----------------------------------------------------------- |
| `src/proxy.ts`    | renova o cookie; tira quem não tem sessão | middleware do Next já foi contornável por cabeçalho forjado |
| `requireAccess()` | tudo o mais, **dentro** da renderização   | não cobre o que o RLS cobre — consulta direta, API, engano  |
| RLS               | a consulta, no banco                      | não sabe redirecionar nem explicar                          |

A ordem importa menos que a independência: cada uma erra por motivos
diferentes, e é por isso que são três.

### O proxy decide uma coisa só

Falta de sessão. É a negação mais comum, a mais barata de detectar e a única
que não precisa saber de empresa, vínculo, módulo ou permissão.

Montar o `Viewer` ali custaria duas consultas ao banco em **toda** requisição,
inclusive nas que nem chegam a renderizar página. E — mais importante — uma
camada que pode ser pulada não deve ser a que decide. `CVE-2025-29927` foi
exatamente isso no Next: um cabeçalho fazia o middleware inteiro não rodar.

`lib/auth/edge.ts` tem um invariante provando que o proxy **nunca nega por um
motivo que não consultou**. Sem ele, a ausência aparente de empresa — que só
existe porque o proxy não perguntou — mandaria um administrador legítimo para
o onboarding.

### O caminho é literal, nunca lido de cabeçalho

`requireAccess('/admin')` tem a string escrita no arquivo. Seria cômodo o proxy
anunciar o caminho num cabeçalho e o layout obedecer — e quem pedisse `/admin`
anunciando `/painel` seria avaliado pela regra mais fraca.

O layout de um grupo cobre o **piso** do grupo (`requireSession()`), e cada
página exige o que é dela. Guardar `/painel` no layout de `(app)` faria
`/acesso-negado`, que vive no mesmo grupo, ser avaliada pela regra de outra
rota — e negar quem veio ler o motivo de ter sido negado.

## `getUser()`, nunca `getSession()`

`getSession()` lê o cookie e acredita. O cookie vem do navegador, e o navegador
é do outro lado: acreditar nele é deixar a autorização na mão de quem ela
deveria conter. `getUser()` valida o token antes de responder.

Custa uma ida à rede por requisição e compra a única coisa que importa nesta
camada.

## De cookie a `Viewer`

```
cookie ──▶ getUser() ──▶ my_tenants() ──▶ chooseTenant() ──▶ current_viewer(id)
                                                                     │
                                                              parseViewer()
                                                                     │
                                                                  Viewer
```

`current_viewer()` responde num `jsonb` com a forma exata do `Viewer` de
`@tivexy/core` — ver [[../02-ARCHITECTURE/DATABASE|DATABASE]]. Um teste de
contratos impede os dois lados de divergirem.

`parseViewer()` é tolerante de propósito: qualquer coisa fora do formato vira
`ANONYMOUS`. **Contexto malformado precisa resultar em menos acesso, não em
exceção** — e muito menos em acesso indevido. A camada de sessão segue a mesma
regra: erro de rede vira "sem sessão", não página de erro.

`cache()` do React envolve a leitura. Layout e página perguntam a mesma coisa
na mesma renderização; sem ele seriam quatro idas ao banco por página. O cache
é da requisição, então não vaza entre pessoas.

## De qual empresa é a requisição

Três fontes, nesta ordem, e a ordem é a regra:

1. **o endereço** — `acme.tivexy.com.br` é a Acme, ponto
2. **o cookie** — a última empresa escolhida, quando o endereço não diz
3. **o único vínculo** — quem participa de uma empresa só não escolhe nada

**O endereço ganha do cookie, e isso não é detalhe de precedência.** Quem abre
`acme.tivexy.com.br` e enxerga os dados da Bravo não tem como perceber o
engano: a tela é a mesma, os números é que são de outra empresa.

O caso que não pode virar silêncio é o endereço nomear uma empresa que a pessoa
não alcança. A tentação é cair para a empresa dela, que é o que "funciona" — e
responderia a um endereço com os dados de outro. Vira **404**, não mensagem
melhor: dizer "você não tem acesso à Acme" confirma que a Acme é cliente da
Tivexy para quem digitar subdomínios até acertar. É o mesmo silêncio que
`current_viewer()` pratica no banco.

O cookie guarda só o slug, que é público — está na barra de endereço. Quem
decide o que ele alcança é `my_tenants()`, a cada requisição: um cookie
adulterado aponta, no máximo, para uma empresa que a pessoa já podia abrir.

## As saídas do limbo

`redirectFor()` manda quem foi negado para uma dessas, e todas exigem **apenas
sessão** — exigir vínculo ativo criaria laço:

| Rota          | Para quem                                         |
| ------------- | ------------------------------------------------- |
| `/entrar`     | sem sessão                                        |
| `/onboarding` | sem empresa nenhuma                               |
| `/empresas`   | com mais de uma, e nenhuma escolhida              |
| `/convite`    | vínculo `invited`                                 |
| `/preparando` | empresa em provisionamento, suspensa ou cancelada |

`/acesso-negado` é onde param as negações **sem** destino — falta de permissão
e módulo não contratado. Redirecionar quem simplesmente não tem permissão o
deixaria em laço sem entender o que houve.

## Aceitar convite: a escrita que o RLS precisa negar

Até 24/09/2026, `/convite` não tinha botão de aceitar, e a ausência era
deliberada — um botão que parecesse aceitar e falhasse seria pior do que dizer
a verdade.

O impasse é real: ativar o vínculo é `update tenant_users set status =
'active'`, e as políticas dessa tabela exigem ser **membro ativo** do tenant.
Quem está naquela tela é, por definição, quem o RLS recusa.

**Afrouxar a política seria a saída errada.** Ela passaria a aceitar escrita de
quem só foi convidado, e convite pendente é o estado de menor confiança que
existe no sistema. A saída certa é uma função `SECURITY DEFINER` estreita:
`accept_invite(p_tenant_id)`.

Ela não relaxa nenhuma regra. Executa **uma** operação como dona da função e
confere quatro coisas antes:

| Confere                   | Porque sem isso                                   |
| ------------------------- | ------------------------------------------------- |
| Há sessão                 | `auth.uid()` nulo casaria com `user_id is null`   |
| O vínculo é de quem chama | Aceitar convite alheio é entrar na conta de outro |
| O vínculo está `invited`  | Não reescrever `joined_at` de quem já entrou      |
| O tenant está `active`    | Convite de cliente cancelado daria conta morta    |

**O parâmetro é o tenant, nunca o usuário.** A pessoa é sempre `auth.uid()`.
Uma versão que recebesse `user_id` seria uma porta para entrar na conta de
qualquer um com convite pendente — e é o teste mais importante do arquivo de
testes, conferido quebrando a trava de propósito.

As mensagens de recusa são **todas iguais**: convite inexistente, de outra
pessoa, suspenso ou de tenant cancelado respondem a mesma frase. Distinguir
contaria a quem tentasse se aquele tenant tem convite pendente para aquele
e-mail — é o mesmo silêncio que `current_viewer()` já pratica.

Clique repetido responde igual e não reescreve `joined_at` nem duplica a
auditoria: numa tela com um botão só, duplo clique é o comportamento mais
comum do mundo.

`security definer` sem `search_path` fixo é escalada de privilégio, e o teste
de esquema varre o catálogo atrás exatamente disso.

## Não dizer quem existe

Erro de credencial é **sempre o mesmo texto**, e a recuperação responde igual
tenha o endereço conta ou não.

Distinguir "senha incorreta" de "e-mail não encontrado" entrega a lista de
e-mails cadastrados a quem mandar um por um — o primeiro passo de quem vai
tentar senha em massa depois.

A exceção é `email_not_confirmed`, e ela é consciente: a API do Supabase já
devolve esse código para qualquer um que chame direto, então escondê-lo na
nossa tela não fecha vazamento nenhum — só deixa a pessoa presa sem saber o
que fazer.

## O primeiro Super Admin

`is_super_admin` só pode ser escrito por quem já é Super Admin. A política
existe para ninguém se promover sozinho, e **não abre exceção para o primeiro**
— nem deve. Então o primeiro nasce de fora, uma vez:

```bash
node scripts/super-admin.mjs voce@empresa.com.br "Seu Nome"
```

O gatilho `mirror_auth_user` espelha `auth.users` em `public.users` e
deliberadamente **não** copia `is_super_admin`: o metadado vem do cliente, e
copiá-lo inteiro deixaria qualquer pessoa se promover no cadastro. Por isso a
promoção é um `update` explícito, com a chave de serviço.

## A entrega do convite depende de SMTP 🔒

**Criar a conta não precisa de e-mail; entregar o convite precisa.**

A primeira versão usava `inviteUserByEmail`, que recusa o endereço quando não
consegue enviar e responde `Email address "…" is invalid`. Sem SMTP próprio no
projeto, isso é todo endereço que não seja de um membro da equipe — e o
provisionamento inteiro parava numa mensagem que falava de e-mail inválido
enquanto o e-mail estava certo.

O plano já separava as duas coisas — `create_admin` cria, `send_invite` entrega
— e o executor passou a respeitar a separação. Enquanto não houver SMTP, a tela
**não diz que mandou e-mail**: diz que não mandou, e gera o link de acesso para
o Super Admin repassar. Ver [[../06-ADMIN/PROVISIONING|PROVISIONING]].

## O que ainda não existe

- Segundo fator
- Sessão revogável pelo administrador da empresa
- Registro de tentativas de login por conta — hoje o limite é o do Supabase
