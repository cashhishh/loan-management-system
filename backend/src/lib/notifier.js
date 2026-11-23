import { env } from '../config/env.js';

const MESSAGES = {
  SUBMITTED: 'Your loan application has been submitted and is waiting for review.',
  UNDER_REVIEW: 'A loan officer has started reviewing your application.',
  MORE_INFO_NEEDED: 'The loan officer needs more information from you.',
  RECOMMENDED_APPROVAL: 'Your application has been reviewed and sent for final approval.',
  RECOMMENDED_REJECTION: 'Your application has been reviewed and sent for final decision.',
  APPROVED: 'Congratulations! Your loan has been approved. Your EMI schedule is ready.',
  REJECTED: 'We are sorry, your loan application was not approved.',
};

export const sentNotifications = [];

/**
 * Email simulation: logs the email that would be sent. Swap the body of this
 * function for Nodemailer/SES/Mailtrap without touching callers.
 */
export function notifyStatusChange({ to, name, applicationNo, status, note }) {
  const mail = {
    to,
    subject: `Loan application LN-${String(applicationNo).padStart(6, '0')}: ${status.replaceAll('_', ' ')}`,
    body: `Hi ${name},\n\n${MESSAGES[status] ?? `Status changed to ${status}.`}${
      note ? `\n\nNote: ${note}` : ''
    }\n\n— LMS`,
    sentAt: new Date().toISOString(),
  };
  sentNotifications.push(mail);
  if (sentNotifications.length > 100) sentNotifications.shift();
  if (!env.isTest) console.log(`📧 [mail] to=${mail.to} subject="${mail.subject}"`);
  return mail;
}
