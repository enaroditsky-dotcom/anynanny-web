export type BookingStatus = "pending" | "confirmed";

/** yyyy-mm-dd */
export type DateISO = string;

export type DayAvailability = {
  sitterId: string;
  date: DateISO;
  /** Slot indices 0..47 that the sitter marked available */
  availableSlots: number[];
};

export type CalendarBooking = {
  id: string;
  sitterId: string;
  date: DateISO;
  /** Inclusive start slot index */
  startSlot: number;
  /** Exclusive end slot index (half-open interval) */
  endSlot: number;
  status: BookingStatus;
  parentName: string;
  createdAt: string;
};

export type SlotVisualState = "past" | "available" | "busy" | "empty";

export type CalendarSlotView = {
  index: number;
  label: string;
  state: SlotVisualState;
  bookingId?: string;
};
