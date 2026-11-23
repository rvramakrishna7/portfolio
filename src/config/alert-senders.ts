export interface AlertSenderConfig {
  id: string;
  name: string;
  senderPattern: RegExp;
  subjectHints?: RegExp;
}

export const ALERT_SENDERS: AlertSenderConfig[] = [
  {
    id: "linkedin",
    name: "LinkedIn Job Alerts",
    senderPattern: /(?:jobalerts-noreply|jobs-noreply|messaging-digest-noreply)@linkedin\.com/i,
    subjectHints: /(?:jobs?|openings?|alert|opportunities|hiring|roles?)/i,
  },
  {
    id: "indeed",
    name: "Indeed Job Alerts",
    senderPattern: /(?:alert|jobalerts|noreply)@indeed\.com/i,
    subjectHints: /(?:jobs?|openings?|alert|new jobs|opportunities)/i,
  },
  {
    id: "glassdoor",
    name: "Glassdoor Alerts",
    senderPattern: /(?:noreply|alerts)@glassdoor\.com/i,
    subjectHints: /(?:jobs?|alert|hiring)/i,
  },
  {
    id: "google_alerts",
    name: "Google Alerts",
    senderPattern: /googlealerts-noreply@google\.com/i,
    subjectHints: /(?:google alert|job|developer|engineer|software)/i,
  },
  {
    id: "instahyre",
    name: "Instahyre",
    senderPattern: /(?:opportunities|alerts|noreply)@instahyre\.com/i,
    subjectHints: /(?:opportunities|job|hiring|match)/i,
  },
  {
    id: "wellfound",
    name: "Wellfound (AngelList)",
    senderPattern: /(?:talent|noreply)@wellfound\.com/i,
    subjectHints: /(?:matches|jobs?|startup|remote)/i,
  },
];

/**
 * Checks if a sender email address matches any known job alert sender pattern.
 */
export function isKnownAlertSender(senderEmail: string, subject?: string): boolean {
  return ALERT_SENDERS.some((sender) => {
    if (sender.senderPattern.test(senderEmail)) {
      if (!sender.subjectHints || !subject) return true;
      return sender.subjectHints.test(subject);
    }
    return false;
  });
}
