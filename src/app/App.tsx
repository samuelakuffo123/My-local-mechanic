import { useEffect, useState } from "react";
import { RouterProvider } from "react-router";
import { ApiError } from "../services/api";
import { authService } from "../services/auth";
import { useAppStore } from "../state/store";
import { router } from "./routes";
import SplashScreen from "../features/splash/SplashScreen";

export default function App() {
  const [ready, setReady] = useState(false);
  const [splashComplete, setSplashComplete] = useState(false);
  const [error, setError] = useState("");

  async function restoreSession() {
    setError("");
    try {
      const user = await authService.me();
      useAppStore.getState().signIn(user);
      setReady(true);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        useAppStore.getState().signOut();
        setReady(true);
        return;
      }
      setError(cause instanceof Error ? cause.message : "The API session could not be restored.");
    }
  }

  useEffect(() => {
    void restoreSession();
  }, []);

  if (error) {
    return (
      <main className="startup-error">
        <p>{error}</p>
        <button onClick={() => void restoreSession()} type="button">Try again</button>
      </main>
    );
  }
  if (!ready || !splashComplete) {
    return <SplashScreen onComplete={() => setSplashComplete(true)} />;
  }
  return <RouterProvider router={router} />;
}
