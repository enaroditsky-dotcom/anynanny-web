export const USER_SPECIAL_OCCASIONS_TABLE = "user_special_occasions" as const;

export type UserSpecialOccasionRow = {
  id: string;
  user_id: string;
  event_name: string;
  event_date: string;
  created_at: string;
};
