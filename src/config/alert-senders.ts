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
    senderPattern: /^[^@\s]+@(?:[a-z0-9-]+\.)*linkedin\.com$/i,
    subjectHints: /(?:jobs?|openings?|alert|opportunities|hiring|roles?)/i,
  },
  {
    id: "naukri",
    name: "Naukri Job Alerts",
    senderPattern: /^[^@\s]+@(?:[a-z0-9-]+\.)*(?:naukri\.com|naukrimail\.com)$/i,
    subjectHints: /(?:jobs?|recommended|handpicked|openings?|alert|vacancies|matching|opportunities|hiring|roles?)/i,
  },
  {
    id: "indeed",
    name: "Indeed Job Alerts",
    senderPattern: /^[^@\s]+@(?:[a-z0-9-]+\.)*indeed\.com$/i,
    subjectHints: /(?:jobs?|openings?|alert|new jobs|opportunities)/i,
  },
  {
    id: "glassdoor",
    name: "Glassdoor Alerts",
    senderPattern: /^(?:noreply|alerts)[^@\s]*@(?:[a-z0-9-]+\.)*glassdoor\.com$/i,
    subjectHints: /(?:jobs?|alert|hiring)/i,
  },
  {
    id: "google_alerts",
    name: "Google Alerts",
    senderPattern: /^googlealerts-noreply@(?:[a-z0-9-]+\.)*google\.com$/i,
    subjectHints: /(?:google alert|job|developer|engineer|software)/i,
  },
  {
    id: "instahyre",
    name: "Instahyre",
    senderPattern: /^(?:opportunities|alerts|noreply)[^@\s]*@(?:[a-z0-9-]+\.)*instahyre\.com$/i,
    subjectHints: /(?:opportunities|job|hiring|match)/i,
  },
  {
    id: "wellfound",
    name: "Wellfound (AngelList)",
    senderPattern: /^[^@\s]+@(?:[a-z0-9-]+\.)*(?:wellfound\.com|angel\.co)$/i,
    subjectHints: /(?:matches|jobs?|startup|remote)/i,
  },
  {
    id: "unstop",
    name: "Unstop",
    senderPattern: /^[^@\s]+@(?:[a-z0-9-]+\.)*unstop\.com$/i,
  },
  {
    id: "flexjobs",
    name: "FlexJobs",
    senderPattern: /^[^@\s]+@(?:[a-z0-9-]+\.)*flexjobs\.com$/i,
  },
  {
    id: "workindia",
    name: "WorkIndia",
    senderPattern: /^[^@\s]+@(?:[a-z0-9-]+\.)*workindia\.(?:info|in)$/i,
  },
  {
    id: "jobhai",
    name: "JobHai",
    senderPattern: /^[^@\s]+@(?:[a-z0-9-]+\.)*jobhai\.com$/i,
  },
  {
    id: "micro1",
    name: "micro1",
    senderPattern: /^[^@\s]+@(?:[a-z0-9-]+\.)*micro1\.(?:io|ai)$/i,
  },
  {
    id: "internshala",
    name: "Internshala",
    senderPattern: /^[^@\s]+@(?:[a-z0-9-]+\.)*internshala\.com$/i,
  },
  {
    id: "shine",
    name: "Shine Job Alerts",
    senderPattern: /^[^@\s]+@(?:[a-z0-9-]+\.)*shine\.com$/i,
  },
  {
    id: "cuvette",
    name: "Cuvette",
    senderPattern: /^[^@\s]+@(?:[a-z0-9-]+\.)*cuvette\.tech$/i,
  },
];

/**
 * Checks if a sender email address matches any known job alert sender pattern.
 */
export function isKnownAlertSender(senderEmail: string, subject?: string): boolean {
  const cleanEmail = (senderEmail || "").trim().replace(/^<|>$/g, "").trim();
  if (!cleanEmail) return false;
  return ALERT_SENDERS.some((sender) => {
    if (sender.senderPattern.test(cleanEmail)) {
      if (!sender.subjectHints || !subject) return true;
      return sender.subjectHints.test(subject);
    }
    return false;
  });
}
