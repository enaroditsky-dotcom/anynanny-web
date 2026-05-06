export type ChatPlatform = "whatsapp" | "telegram";

export type ChatInitiationInput = {
  bookingId: string;
  bookingDate: string;
  parentName: string;
  sitterName: string;
  platform: ChatPlatform;
  sitterPhone?: string;
  sitterTelegramUsername?: string;
};

export type ChatInitiationLog = {
  bookingId: string;
  bookingDate: string;
  parentName: string;
  sitterName: string;
  platform: ChatPlatform;
  externalLink: string;
  initiatedAt: string;
};
