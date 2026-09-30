import type { AuthMethod, TicketPriority, TicketStatus, TicketType } from "@prisma/client";

export const statusLabels: Record<TicketStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  WAITING_ON_CLIENT: "Waiting on you",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

// Staff see the status from their own perspective.
export const staffStatusLabels: Record<TicketStatus, string> = {
  ...statusLabels,
  WAITING_ON_CLIENT: "Waiting on client",
};

export const priorityLabels: Record<TicketPriority, string> = {
  LOW: "Low",
  NORMAL: "Normal",
  HIGH: "High",
  URGENT: "Urgent",
};

export const typeLabels: Record<TicketType, string> = {
  QUESTION: "Question",
  BUG: "Bug / defect",
  FEATURE_REQUEST: "Feature request",
  INCIDENT: "Incident / outage",
};

export const authMethodLabels: Record<AuthMethod, string> = {
  MAGIC_LINK: "Email sign-in link",
  MICROSOFT: "Microsoft",
  GOOGLE: "Google",
  OIDC: "Company SSO",
};

export const OPEN_STATUSES: TicketStatus[] = ["OPEN", "IN_PROGRESS", "WAITING_ON_CLIENT"];
