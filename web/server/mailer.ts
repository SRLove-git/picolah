import { config } from './config.ts';

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
};

export type MailResult = 'sent' | 'logged';

/**
 * Sends transactional mail through Resend when RESEND_API_KEY is configured.
 * Without a provider the message is written to the server log so local flows
 * (and tests) still work end to end.
 */
export async function sendMail(message: MailMessage): Promise<MailResult> {
  if (!config.mail.resendApiKey) {
    console.info(`[mail:dev] to=${message.to} subject=${message.subject}\n${message.text}`);
    return 'logged';
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.mail.resendApiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: config.mail.from,
      to: [message.to],
      subject: message.subject,
      text: message.text,
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`mail provider rejected the message (${response.status}) ${detail}`.trim());
  }
  return 'sent';
}
