export type JobSource =
  | "remoteok"
  | "jobicy"
  | "arbeitnow"
  | "weworkremotely"
  | "greenhouse"
  | "lever"
  | "ashby"
  | "hn";

export interface NormalizedJob {
  source: JobSource | string;
  sourceId: string;
  url: string;
  title: string;
  company: string;
  location: string;
  remoteScope: string;
  description: string; // Plain text, stripped of HTML, max 8000 chars
  postedAt: string; // ISO 8601 string
  tags: string[];
  salaryText?: string;
  applyUrl?: string;
  contactEmail?: string;
  contactUrl?: string;
  isRemote?: boolean;
  workplaceType?: string;
  inboundRaw?: string;
  inboundSource?: string;
}

export interface AdapterResult {
  jobs: NormalizedJob[];
  error?: string;
}

export const USER_AGENT = "RamakrishnaJobDesk/1.0 (personal use)";
export const REQUEST_TIMEOUT_MS = 10000;
