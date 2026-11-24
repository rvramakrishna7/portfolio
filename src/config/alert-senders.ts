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
    senderPattern: /(?:jobalerts-noreply|jobs-noreply|messaging-digest-noreply|jobs-listings|alert|updates|notifications)?.*@(?:[a-z0-9-]+\.)*linkedin\.com/i,
    subjectHints: /(?:jobs?|openings?|alert|opportunities|hiring|roles?)/i,
  },
  {
    id: "naukri",
    name: "Naukri Job Alerts",
    senderPattern: /(?:noreply|alerts|digest|recommendations|mailer|info|jobalerts)?.*@(?:[a-z0-9-]+\.)*(?:naukri\.com|naukrimail\.com)/i,
    subjectHints: /(?:jobs?|recommended|handpicked|openings?|alert|vacancies|matching|opportunities|hiring|roles?)/i,
  },
  {
    id: "indeed",
    name: "Indeed Job Alerts",
    senderPattern: /(?:alert|jobalerts|noreply)@(?:[a-z0-9-]+\.)*indeed\.com/i,
    subjectHints: /(?:jobs?|openings?|alert|new jobs|opportunities)/i,
  },
  {
    id: "glassdoor",
    name: "Glassdoor Alerts",
    senderPattern: /(?:noreply|alerts)@(?:[a-z0-9-]+\.)*glassdoor\.com/i,
    subjectHints: /(?:jobs?|alert|hiring)/i,
  },
  {
    id: "google_alerts",
    name: "Google Alerts",
    senderPattern: /googlealerts-noreply@(?:[a-z0-9-]+\.)*google\.com/i,
    subjectHints: /(?:google alert|job|developer|engineer|software)/i,
  },
  {
    id: "instahyre",
    name: "Instahyre",
    senderPattern: /(?:opportunities|alerts|noreply)@(?:[a-z0-9-]+\.)*instahyre\.com/i,
    subjectHints: /(?:opportunities|job|hiring|match)/i,
  },
  {
    id: "wellfound",
    name: "Wellfound (AngelList)",
    senderPattern: /(?:talent|noreply|alerts|digest|matches)?.*@(?:[a-z0-9-]+\.)*(?:wellfound\.com|angel\.co)/i,
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
