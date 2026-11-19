// Thin wrapper around Google Identity Services' token model. The client ID is
// public by design; the access token is verified by the MechNow API before a
// session is issued. No token or profile data is trusted in the browser.

const SCRIPT_ID = "mechnow-google-gis";
const GIS_SRC = "https://accounts.google.com/gsi/client";
const POPUP_TIMEOUT_MS = 3 * 60_000;

interface TokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
  scope?: string;
}

interface TokenClient {
  requestAccessToken: () => void;
}

interface GoogleIdentitySdk {
  accounts: {
    oauth2: {
      initTokenClient: (config: {
        client_id: string;
        scope: string;
        callback: (response: TokenResponse) => void;
        error_callback?: (error: unknown) => void;
      }) => TokenClient;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdentitySdk;
  }
}

let loadPromise: Promise<void> | null = null;

export function isGoogleIdentityLoaded(): boolean {
  return Boolean(window.google?.accounts?.oauth2?.initTokenClient);
}

/** Loads the Google-hosted script once. Call early so the popup stays in the click gesture. */
export function preloadGoogleIdentity(): Promise<void> {
  if (isGoogleIdentityLoaded()) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    const script = existing ?? document.createElement("script");
    if (!existing) {
      script.id = SCRIPT_ID;
      script.src = GIS_SRC;
      script.async = true;
      script.defer = true;
    }

    const settle = (error?: Error) => {
      if (error) {
        script.remove();
        loadPromise = null;
        reject(error);
        return;
      }
      resolve();
    };

    if (existing) {
      script.addEventListener("load", () => settle(), { once: true });
      script.addEventListener("error", () => settle(new Error("Google sign-in could not load.")), { once: true });
      return;
    }

    script.onload = () => settle();
    script.onerror = () => settle(new Error("Google sign-in could not load."));
    document.head.appendChild(script);
  });

  return loadPromise;
}

function oauthMessage(reason: unknown): string {
  const type =
    reason && typeof reason === "object" && "type" in reason
      ? String((reason as { type?: unknown }).type)
      : reason instanceof Error ? reason.message : "";
  if (/popup_closed|closed_by_user/i.test(type)) return "Google sign-in was cancelled. Try again when you're ready.";
  if (/access_denied/i.test(type)) return "Google sign-in was cancelled. You can still use your phone number.";
  return "Google sign-in didn't complete. Try again or use your phone number.";
}

/**
 * Requests only name/email. Google performs account selection, sign-in and
 * consent in its own popup; nothing is read from the popup by this app.
 */
export async function requestGoogleAccessToken(clientId: string): Promise<string> {
  if (!clientId) throw new Error("Google sign-in isn't configured yet.");
  if (!isGoogleIdentityLoaded()) await preloadGoogleIdentity();

  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const finish = (work: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      work();
    };

    const timeout = window.setTimeout(() => {
      finish(() => reject(new Error("Google sign-in took too long. Try again or use your phone number.")));
    }, POPUP_TIMEOUT_MS);

    try {
      const client = window.google!.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: "openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile",
        callback: (response) => {
          if (response.error) {
            finish(() => reject(new Error(oauthMessage(response.error ?? response.error_description))));
            return;
          }
          const token = response.access_token;
          if (!token) {
            finish(() => reject(new Error("Google sign-in didn't return a token. Try again or use your phone number.")));
            return;
          }
          finish(() => resolve(token));
        },
        error_callback: (error) => {
          finish(() => reject(new Error(oauthMessage(error))));
        },
      });
      client.requestAccessToken();
    } catch (error) {
      finish(() => reject(error instanceof Error ? error : new Error(oauthMessage(error))));
    }
  });
}
