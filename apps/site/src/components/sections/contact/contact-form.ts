import { PUBLIC_LEADS_ENDPOINT } from 'astro:env/client';
import { contact, hasEmail, hasWhatsapp, whatsappUrl } from '@/config/site';

type ValidatedField = 'nome' | 'empresa' | 'email' | 'whatsapp' | 'necessidade';
type Control = HTMLInputElement | HTMLTextAreaElement;
type ResultKind = 'sent' | 'whatsapp' | 'email';

interface Lead {
  nome: string;
  empresa: string;
  email: string;
  whatsapp: string;
  segmento: string;
  tipoSolucao: string;
  necessidade: string;
  pagina: string;
  enviadoEm: string;
}

const messages: Record<ValidatedField, { missing: string; invalid?: string }> = {
  nome: { missing: 'Informe seu nome.', invalid: 'Digite pelo menos 2 letras.' },
  empresa: { missing: 'Informe o nome da empresa.', invalid: 'Digite pelo menos 2 letras.' },
  email: {
    missing: 'Informe seu e-mail.',
    invalid: 'Digite um e-mail válido, como nome@empresa.com.br.',
  },
  whatsapp: {
    missing: 'Informe seu WhatsApp com DDD.',
    invalid: 'Digite o WhatsApp com DDD, como (11) 91234-5678.',
  },
  necessidade: {
    missing: 'Conte, em poucas palavras, o que sua empresa precisa.',
    invalid: 'Conte um pouco mais: pelo menos 10 caracteres.',
  },
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const SPINNER_PATH = '<path d="M12 3.5a8.5 8.5 0 1 0 8.5 8.5"/>';

const onlyDigits = (value: string) => value.replace(/\D/g, '');

function formatPhone(value: string): string {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length === 0) return '';
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function validate(control: Control): string {
  const name = control.name as ValidatedField;
  const rules = messages[name];
  if (!rules) return '';

  const value = control.value.trim();

  if (name === 'whatsapp') {
    const digits = onlyDigits(value);
    if (digits.length === 0) return rules.missing;
    return digits.length === 10 || digits.length === 11 ? '' : rules.invalid!;
  }

  if (value.length === 0) return rules.missing;
  if (name === 'email') return EMAIL_PATTERN.test(value) ? '' : rules.invalid!;

  const minLength = Number(control.getAttribute('minlength') ?? 0);
  return value.length < minLength ? rules.invalid! : '';
}

function composeMessage(lead: Lead): string {
  const lines = [
    'Olá, Tivexy! Quero enviar um projeto.',
    '',
    `*Nome:* ${lead.nome}`,
    `*Empresa:* ${lead.empresa}`,
    `*E-mail:* ${lead.email}`,
    `*WhatsApp:* ${lead.whatsapp}`,
  ];
  if (lead.segmento) lines.push(`*Segmento:* ${lead.segmento}`);
  if (lead.tipoSolucao) lines.push(`*Tipo de solução:* ${lead.tipoSolucao}`);
  lines.push('', '*O que a empresa precisa:*', lead.necessidade);
  return lines.join('\n');
}

function mailtoUrl(lead: Lead): string {
  const subject = encodeURIComponent(`Novo projeto: ${lead.empresa}`);
  const body = encodeURIComponent(composeMessage(lead).replace(/\*/g, ''));
  return `mailto:${contact.email}?subject=${subject}&body=${body}`;
}

function link(href: string, text: string, external = false): HTMLAnchorElement {
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.textContent = text;
  if (external) {
    anchor.target = '_blank';
    anchor.rel = 'noopener';
  }
  return anchor;
}

function initContactForm(form: HTMLFormElement) {
  const card = form.parentElement!;
  const result = card.querySelector<HTMLElement>('[data-form-result]')!;
  const resultTitle = result.querySelector<HTMLElement>('[data-result-title]')!;
  const resultText = result.querySelector<HTMLElement>('[data-result-text]')!;
  const alert = form.querySelector<HTMLElement>('[data-form-alert]')!;
  const submit = form.querySelector<HTMLButtonElement>('[data-submit]')!;
  const submitLabel = submit.querySelector<HTMLElement>('.btn__label')!;
  const submitIcon = submit.querySelector<SVGElement>('.icon');
  const phone = form.querySelector<HTMLInputElement>('[data-phone]')!;
  const need = form.querySelector<HTMLTextAreaElement>('textarea[name="necessidade"]')!;
  const interestInputs = Array.from(
    form.querySelectorAll<HTMLInputElement>('[data-interest-value]'),
  );
  const validated = Array.from(
    form.querySelectorAll<Control>(
      'input[name="nome"], input[name="empresa"], input[name="email"], input[name="whatsapp"], textarea[name="necessidade"]',
    ),
  );

  const originalLabel = submitLabel.textContent ?? 'Enviar projeto';
  const originalIcon = submitIcon?.innerHTML ?? '';
  let submitting = false;

  const showError = (control: Control, message: string) => {
    const error = form.querySelector<HTMLElement>(`[data-error-for="${control.name}"]`);
    if (message) {
      control.setAttribute('aria-invalid', 'true');
      if (error) {
        error.textContent = message;
        error.hidden = false;
      }
    } else {
      control.removeAttribute('aria-invalid');
      if (error) {
        error.textContent = '';
        error.hidden = true;
      }
    }
  };

  const setBusy = (busy: boolean) => {
    submitting = busy;
    submit.disabled = busy;
    submit.setAttribute('aria-busy', String(busy));
    submitLabel.textContent = busy ? 'Enviando projeto…' : originalLabel;
    if (submitIcon) submitIcon.innerHTML = busy ? SPINNER_PATH : originalIcon;
  };

  const selectInterest = (value: string | null | undefined) => {
    const match = interestInputs.find((input) => input.dataset.interestValue === value);
    if (match) match.checked = true;
  };

  const showResult = (kind: ResultKind, lead?: Lead) => {
    resultText.replaceChildren();

    if (kind === 'sent') {
      resultTitle.textContent = 'Projeto enviado.';
      resultText.append(
        'Recebemos suas informações. A Tivexy vai responder pelo e-mail ou WhatsApp que você informou.',
      );
    } else if (kind === 'whatsapp' && lead) {
      resultTitle.textContent = 'Seu projeto está pronto no WhatsApp.';
      resultText.append(
        'Abrimos uma conversa com a Tivexy já com as suas respostas. É só tocar em enviar. Se a conversa não abriu, ',
        link(whatsappUrl(composeMessage(lead)), 'abra o WhatsApp por aqui', true),
        '.',
      );
    } else if (kind === 'email' && lead) {
      resultTitle.textContent = 'Seu projeto está pronto no e-mail.';
      resultText.append(
        'Abrimos o seu aplicativo de e-mail com as respostas preenchidas. É só enviar. Se nada abriu, escreva para ',
        link(mailtoUrl(lead), contact.email),
        '.',
      );
    }

    form.hidden = true;
    result.hidden = false;
    result.focus();
  };

  const showAlert = () => {
    alert.replaceChildren('Não foi possível enviar agora. Verifique sua conexão e tente de novo.');
    if (hasWhatsapp) {
      alert.append(
        ' Se preferir, ',
        link(whatsappUrl(), 'fale com a Tivexy no WhatsApp', true),
        '.',
      );
    } else if (hasEmail) {
      alert.append(
        ' Se preferir, escreva para ',
        link(`mailto:${contact.email}`, contact.email),
        '.',
      );
    }
    alert.hidden = false;
  };

  // Máscara do WhatsApp: formata ao digitar, sem atrapalhar quando a pessoa apaga.
  phone.addEventListener('input', (event) => {
    if ((event as InputEvent).inputType?.startsWith('delete')) return;
    phone.value = formatPhone(phone.value);
  });

  validated.forEach((control) => {
    control.addEventListener('blur', () => {
      if (control.value.trim() || control.hasAttribute('aria-invalid')) {
        if (control === phone) phone.value = formatPhone(phone.value);
        showError(control, validate(control));
      }
    });
    control.addEventListener('input', () => {
      if (control.hasAttribute('aria-invalid')) showError(control, validate(control));
    });
  });

  // Interesse vindo de outros botões (ex.: "Quero ser avisado") ou de ?interesse=
  // Botões com data-message também começam o texto da necessidade, sem apagar o que a pessoa escreveu.
  let suggestedNeed = '';
  selectInterest(new URLSearchParams(window.location.search).get('interesse'));
  document.addEventListener('click', (event) => {
    const trigger = (event.target as Element | null)?.closest<HTMLElement>('[data-interest]');
    if (!trigger) return;
    selectInterest(trigger.dataset.interest);

    const message = trigger.dataset.message;
    if (message && (!need.value.trim() || need.value === suggestedNeed)) {
      need.value = suggestedNeed = message;
      if (need.hasAttribute('aria-invalid')) showError(need, validate(need));
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submitting) return;
    alert.hidden = true;

    let firstInvalid: Control | undefined;
    for (const control of validated) {
      const message = validate(control);
      showError(control, message);
      if (message && !firstInvalid) firstInvalid = control;
    }
    if (firstInvalid) {
      firstInvalid.focus();
      return;
    }

    const data = new FormData(form);
    const text = (name: string) => String(data.get(name) ?? '').trim();

    // Campo invisível preenchido = robô. Responde como sucesso e não envia nada.
    if (text('site')) {
      showResult('sent');
      return;
    }

    const lead: Lead = {
      nome: text('nome'),
      empresa: text('empresa'),
      email: text('email'),
      whatsapp: formatPhone(text('whatsapp')),
      segmento: text('segmento'),
      tipoSolucao: text('tipoSolucao'),
      necessidade: text('necessidade'),
      pagina: window.location.href,
      enviadoEm: new Date().toISOString(),
    };

    setBusy(true);
    try {
      if (PUBLIC_LEADS_ENDPOINT) {
        const response = await fetch(PUBLIC_LEADS_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(lead),
        });
        if (!response.ok) throw new Error(`Falha no envio: HTTP ${response.status}`);
        showResult('sent');
      } else if (hasWhatsapp) {
        window.open(whatsappUrl(composeMessage(lead)), '_blank', 'noopener');
        showResult('whatsapp', lead);
      } else if (hasEmail) {
        window.location.href = mailtoUrl(lead);
        showResult('email', lead);
      } else if (import.meta.env.DEV) {
        await new Promise((resolve) => setTimeout(resolve, 900));
        console.warn(
          '[contato] Nenhum destino configurado (PUBLIC_LEADS_ENDPOINT, PUBLIC_WHATSAPP_NUMBER ou PUBLIC_CONTACT_EMAIL). Envio simulado em desenvolvimento.',
          lead,
        );
        showResult('sent');
      } else {
        throw new Error('Nenhum destino configurado para o formulário de contato.');
      }
    } catch (error) {
      console.error(error);
      showAlert();
    } finally {
      setBusy(false);
    }
  });

  result.querySelector('[data-form-reset]')?.addEventListener('click', () => {
    form.reset();
    validated.forEach((control) => showError(control, ''));
    result.hidden = true;
    form.hidden = false;
    validated[0]?.focus();
  });
}

const contactForm = document.querySelector<HTMLFormElement>('[data-contact-form]');
if (contactForm && !contactForm.dataset.ready) {
  contactForm.dataset.ready = 'true';
  initContactForm(contactForm);
}
