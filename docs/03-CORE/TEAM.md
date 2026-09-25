# Equipe

> Quem trabalha numa empresa, com que papel, e como entra. A tela é `/equipe`.
> 🟡 _Testado, não verificado contra o banco real (25/09/2026)._

## O que a tela faz

- Lista as pessoas: com acesso, com convite pendente, com acesso suspenso.
- Troca o papel, suspende e reativa, remove, cancela convite.
- Convida por e-mail, com o papel já escolhido.

Tudo exige `core.users.write`. Quem só tem `core.users.read` vê a lista.

Na própria linha não há ação destrutiva: sair da empresa pela própria tela é o
engano que ninguém queria cometer.

## As duas regras que moram no banco

Migration `20260925060000_team_keeps_admin`. As duas foram conferidas
quebrando: sem cada uma, os testes dela falham.

### A empresa não fica sem administrador

Remover, rebaixar ou suspender a **última** pessoa com `tenant_admin` ativo é
recusado. Sem ela, ninguém administra usuários, papéis e configurações — e não
há como sair disso pela tela. Convite pendente de administrador não conta:
ele ainda não administra nada.

Cascata passa. Apagar a empresa ou a conta da pessoa leva o vínculo junto, e
aí não há empresa a proteger, ou não há mais a pessoa.

### Ninguém dá um papel com mais poder que o seu

**Havia uma escalada de privilégio.** O Gestor não tem `core.roles.write`, e o
catálogo explica por quê: "um gestor que edita papéis pode se promover a
administrador". Mas ele tem `core.users.write` — e isso bastava para escrever
`role_id = tenant_admin` em qualquer vínculo, inclusive o dele. A porta que o
catálogo fechou em `roles` estava aberta em `tenant_users`.

Agora quem atribui um papel precisa ter **cada** permissão que o papel dá — ao
convidar e ao trocar. Provisionamento (conexão de serviço, sem `auth.uid()`) e
Super Admin não passam por esta regra: são a plataforma.

Quem não pode escrever vínculos na empresa nem chega a ela: a recusa é do RLS,
com a mensagem do RLS.

## O convite, sem e-mail 🔒

O e-mail de convite depende de SMTP próprio, que não existe ainda. A tela diz
isso, e para **conta nova** entrega o link de acesso para quem convidou
repassar — como o Super Admin já faz.

### O link é credencial, e por isso nem sempre sai

Quem abre o link entra **como aquela conta**. Para o Super Admin, gerar link
para qualquer conta é aceitável: é a plataforma. Para quem administra uma
empresa, não seria: convidar a diretora de outra empresa cliente entregaria o
login dela.

`decidirLink()` (`lib/team/link-policy.ts`) só gera link para conta que
**ninguém usou** e que **não pertence a nenhuma outra empresa** — uma conta que
não tem nada a expor além deste convite. Quem já tem conta recebe o convite e o
vê em `/convite` ao entrar, com a própria senha.

A pergunta "tem vínculo em outra empresa?" atravessa empresas, e o RLS não
deixa quem administra uma ver a outra. Ela é feita com a conexão de serviço, em
`server/team.ts`, e sai só como contagem — nenhum nome de outra empresa chega à
tela. A permissão é conferida **antes**.

### Duas conexões, cada uma pelo seu motivo

O vínculo é escrito **com a sessão** de quem convida: passa pelo RLS e pelos
gatilhos como qualquer escrita. A chave de serviço só cria a identidade — que é
do Supabase e não se cria por SQL — e faz a pergunta acima. Se o vínculo for
recusado depois de a conta ter sido criada agora, a conta é apagada: só o que
esta chamada criou, como na compensação do provisionamento.

Toda ação vai para `audit_logs`: convite, papel, suspensão, remoção, e cada
link gerado — sem o link.
