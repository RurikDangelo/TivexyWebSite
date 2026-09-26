import 'server-only';

/**
 * A `IdentityPort` de produção: identidade pela Auth Admin API do Supabase.
 *
 * O executor sempre soube que identidade não se cria por SQL — a fronteira está
 * nomeada em `execute.ts` desde antes de haver banco aplicado. Esta é a outra
 * ponta dela. Até agora só existia a implementação do teste; agora existe a que
 * vai rodar.
 *
 * ## Procurar por SQL, criar pela API
 *
 * A divisão parece arbitrária e não é. Criar envolve hash de senha, linha em
 * `auth.identities` e envio de e-mail — coisas do Supabase, que fazer por SQL
 * produziria um usuário que existe e não consegue entrar. Procurar é uma
 * consulta, e a API não oferece busca por e-mail: só listagem paginada, que
 * custa uma varredura de todas as contas para achar uma.
 *
 * ## `createUser`, não `inviteUserByEmail`
 *
 * Criar a identidade e **entregar** o convite são duas coisas, e o plano já as
 * separa: `create_admin` cria, `send_invite` entrega. Juntá-las numa chamada
 * só apaga essa distinção — e foi o que a primeira versão fez, com uma
 * consequência concreta.
 *
 * `inviteUserByEmail` recusa o endereço quando não consegue enviar, e devolve
 * `Email address "…" is invalid`. Sem SMTP próprio no projeto, isso é **todo**
 * endereço que não seja de um membro da equipe — o embutido do Supabase não
 * entrega para mais ninguém. O provisionamento inteiro parava em
 * `create_admin` com uma mensagem que fala de e-mail inválido quando o e-mail
 * está certo e o que falta é o servidor de envio.
 *
 * `createUser` não envia nada e não depende de SMTP. A conta nasce sem senha
 * e sem sessão: ninguém entra com ela até abrir um link de acesso.
 *
 * > **A entrega continua pendente de SMTP**, e isso não é escondido: o convite
 * > não sai sozinho, e o Super Admin gera o link de acesso na tela para
 * > repassar. Ver `docs/PROJECT_STATE.md`, dependências externas.
 */

import { supabaseAdmin } from '../../lib/supabase/admin.ts';
import type { IdentityPort, SqlClient } from './execute.ts';

/** O Supabase guarda e-mail em minúsculas. Comparar sem normalizar não acha. */
function normalizar(email: string): string {
  return email.trim().toLowerCase();
}

async function procurarPorEmail(db: SqlClient, email: string): Promise<string | null> {
  const { rows } = await db.query('select id from auth.users where email = $1 limit 1', [
    normalizar(email),
  ]);
  const id = rows[0]?.id;
  return typeof id === 'string' ? id : null;
}

export function identityPort(db: SqlClient): IdentityPort {
  return {
    async ensureUser({ email, fullName }) {
      const existente = await procurarPorEmail(db, email);
      if (existente !== null) return { id: existente, created: false };

      const { data, error } = await supabaseAdmin().auth.admin.createUser({
        email: normalizar(email),
        /*
         * Não confirmado: quem vai confirmar é a própria pessoa, ao abrir o
         * link de acesso. Marcar como confirmado aqui diria que um endereço
         * foi verificado sem que ninguém tenha verificado nada.
         */
        email_confirm: false,
        user_metadata: { full_name: fullName },
      });

      if (error !== null) {
        /*
         * Corrida: outra execução criou a mesma conta entre a consulta acima e
         * esta chamada. Não é erro — é a resposta "já existe", e quem existe
         * antes desta execução não pode ser apagado por ela.
         */
        const agora = await procurarPorEmail(db, email);
        if (agora !== null) return { id: agora, created: false };

        throw new Error(`não consegui criar a conta de ${normalizar(email)}: ${error.message}`);
      }

      if (data.user === null) {
        throw new Error(`a criação da conta de ${normalizar(email)} não devolveu usuário`);
      }

      return { id: data.user.id, created: true };
    },

    async deleteUser(id) {
      const { error } = await supabaseAdmin().auth.admin.deleteUser(id);
      if (error !== null) {
        throw new Error(`não consegui remover a identidade ${id}: ${error.message}`);
      }
    },
  };
}
