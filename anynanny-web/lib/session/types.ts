export type SessionParty = "parent" | "sitter";
export type SessionStatus = "waiting_start" | "active" | "waiting_end" | "completed";

export type SessionRecord = {
  sessionId: string;
  bookingId: string;
  sitterId: string;
  parentName: string;
  hourlyRateNis: number;
  status: SessionStatus;
  startConfirmations: Partial<Record<SessionParty, string>>;
  endConfirmations: Partial<Record<SessionParty, string>>;
  startedAt?: string;
  endedAt?: string;
  reassurancePingEnabled: boolean;
  pingedHours: string[];
};

export type SessionView = SessionRecord & {
  waitingFor?: SessionParty;
  exactMinutes: number;
  accumulatedCostNis: number;
};
