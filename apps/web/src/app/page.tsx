import { redirect } from 'next/navigation';

export default function Home() {
  /* Enquanto não há autenticação, a raiz leva direto para a visão geral.
     Quando o login existir, esta rota decide entre /entrar e /painel. */
  redirect('/painel');
}
