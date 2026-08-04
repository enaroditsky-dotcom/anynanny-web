export type LocationPreference = "always" | "while_using" | "denied";

export const LOCATION_PREFERENCE_STORAGE_KEY = "anynanny_location_preference";

export const LOCATION_PREFERENCE_OPTIONS: {
  value: LocationPreference;
  label: string;
  shortLabel: string;
}[] = [
  { value: "always", label: "מסכים תמיד", shortLabel: "תמיד" },
  {
    value: "while_using",
    label: "רק בזמן שהאפליקציה בשימוש",
    shortLabel: "בשימוש"
  },
  { value: "denied", label: "לא מסכים", shortLabel: "לא מסכים" }
];

const VALID: LocationPreference[] = ["always", "while_using", "denied"];

let activeWatchId: number | null = null;

export function isLocationPreference(value: unknown): value is LocationPreference {
  return typeof value === "string" && VALID.includes(value as LocationPreference);
}

export function readLocationPreference(): LocationPreference {
  if (typeof window === "undefined") return "while_using";
  try {
    const stored = localStorage.getItem(LOCATION_PREFERENCE_STORAGE_KEY);
    return isLocationPreference(stored) ? stored : "while_using";
  } catch {
    return "while_using";
  }
}

export function writeLocationPreference(preference: LocationPreference): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LOCATION_PREFERENCE_STORAGE_KEY, preference);
  } catch {
    /* ignore */
  }
}

export function getLocationPreferenceLabel(preference: LocationPreference): string {
  return LOCATION_PREFERENCE_OPTIONS.find((opt) => opt.value === preference)?.label ?? preference;
}

export function getLocationPreferenceShortLabel(preference: LocationPreference): string {
  return LOCATION_PREFERENCE_OPTIONS.find((opt) => opt.value === preference)?.shortLabel ?? preference;
}

export function stopLocationTracking(): void {
  if (typeof window === "undefined" || activeWatchId === null) return;
  if (!navigator.geolocation) {
    activeWatchId = null;
    return;
  }
  navigator.geolocation.clearWatch(activeWatchId);
  activeWatchId = null;
}

export function isGeolocationAllowed(preference: LocationPreference = readLocationPreference()): boolean {
  if (preference === "denied") return false;
  if (preference === "while_using" && typeof document !== "undefined") {
    return document.visibilityState === "visible";
  }
  return true;
}

export function requestBrowserGeolocationPermission(): Promise<boolean> {
  if (typeof window === "undefined" || !navigator.geolocation) return Promise.resolve(false);

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      () => resolve(true),
      () => resolve(false),
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 12_000 }
    );
  });
}

export async function applyLocationPreference(preference: LocationPreference): Promise<void> {
  writeLocationPreference(preference);

  if (preference === "denied") {
    stopLocationTracking();
    return;
  }

  await requestBrowserGeolocationPermission();
}

export function requestCurrentPosition(
  options?: PositionOptions
): Promise<GeolocationPosition> {
  const preference = readLocationPreference();

  if (!isGeolocationAllowed(preference)) {
    return Promise.reject(new Error("location_denied"));
  }

  if (typeof window === "undefined" || !navigator.geolocation) {
    return Promise.reject(new Error("geolocation_unavailable"));
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

export function watchCurrentPosition(
  success: PositionCallback,
  error?: PositionErrorCallback,
  options?: PositionOptions
): number | null {
  const preference = readLocationPreference();

  if (!isGeolocationAllowed(preference)) {
    return null;
  }

  if (typeof window === "undefined" || !navigator.geolocation) {
    return null;
  }

  stopLocationTracking();
  activeWatchId = navigator.geolocation.watchPosition(success, error, options);
  return activeWatchId;
}
