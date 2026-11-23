const ONBOARDING_KEY = "mechnow:onboarding-complete";
const PROFILE_SETUP_KEY = "mechnow:profile-setup-complete:";

export function hasCompletedOnboarding(): boolean {
  try {
    return window.localStorage.getItem(ONBOARDING_KEY) === "true";
  } catch {
    return false;
  }
}

export function completeOnboarding(): void {
  try {
    window.localStorage.setItem(ONBOARDING_KEY, "true");
  } catch {
    // Storage can be unavailable in private browsing; the intro will simply show again.
  }
}

/**
 * Post-sign-in setup is tracked per account so each new user sees it once,
 * whether they signed up with a phone number or with Google.
 */
export function hasCompletedProfileSetup(userId?: string | null): boolean {
  if (!userId) return false;
  try {
    return window.localStorage.getItem(`${PROFILE_SETUP_KEY}${userId}`) === "true";
  } catch {
    return false;
  }
}

export function completeProfileSetup(userId?: string | null): void {
  if (!userId) return;
  try {
    window.localStorage.setItem(`${PROFILE_SETUP_KEY}${userId}`, "true");
  } catch {
    // Storage can be unavailable; setup will simply be offered again next time.
  }
}

export function needsProfileSetup(userId: string | undefined | null, hasVehicle: boolean): boolean {
  return !hasVehicle && !hasCompletedProfileSetup(userId);
}
