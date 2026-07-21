export const WHATSAPP_TEMPLATE_NAMES = [
  'demo_followup',
  'quote_sent',
  'payment_reminder',
  'welcome_school',
  'meeting_confirmation',
] as const;

export type WhatsAppTemplateName = (typeof WHATSAPP_TEMPLATE_NAMES)[number];

export interface WhatsAppTemplateConfig {
  name: WhatsAppTemplateName;
  displayName: string;
  description: string;
  variables: string[];
}

export const WHATSAPP_TEMPLATES: Record<
  WhatsAppTemplateName,
  WhatsAppTemplateConfig
> = {
  demo_followup: {
    name: 'demo_followup',
    displayName: 'Demo Follow-up',
    description:
      'Thank you for attending the DigiLearn demo. We hope you found it valuable. Would you like to schedule a follow-up discussion?',
    variables: ['schoolName', 'contactName'],
  },
  quote_sent: {
    name: 'quote_sent',
    displayName: 'Quote Sent Notification',
    description:
      'We have sent you a quote for the DigiLearn ecosystem. Please review it at your convenience and let us know if you have any questions.',
    variables: ['contactName', 'quoteNumber'],
  },
  payment_reminder: {
    name: 'payment_reminder',
    displayName: 'Payment Reminder',
    description:
      'This is a friendly reminder that your payment is due. Please ensure timely payment to continue enjoying DigiLearn services.',
    variables: ['schoolName', 'amount', 'dueDate'],
  },
  welcome_school: {
    name: 'welcome_school',
    displayName: 'Welcome New School',
    description:
      'Welcome to DigiLearn! We are excited to have your school join our ecosystem. Our team will be in touch to help you get started.',
    variables: ['schoolName', 'contactName'],
  },
  meeting_confirmation: {
    name: 'meeting_confirmation',
    displayName: 'Meeting Confirmation',
    description:
      'Your meeting with DigiLearn has been confirmed. We look forward to discussing how we can support your school.',
    variables: ['contactName', 'meetingDate', 'meetingTime'],
  },
};
