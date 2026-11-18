const ONBOARDING_KEY = "mechnow:onboarding-complete";

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
