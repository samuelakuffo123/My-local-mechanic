import { useEffect, useState } from "react";
import { RouterProvider } from "react-router";
import { useAppStore } from "../state/store";
import { router } from "./routes";
import SplashScreen from "../features/splash/SplashScreen";

export default function App() {
  const [ready, setReady] = useState(false);
  const [splashComplete, setSplashComplete] = useState(false);
  const [error, setError] = useState("");
  const hydrate = useAppStore((state) => state.hydrate);
  const storeReady = useAppStore((state) => state.ready);

  async function restoreSession() {
    setError("");
    try {
      await hydrate();
      setReady(true);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message.trim() : "";
      setError(message || "We couldn't restore your session. Check your connection and try again.");
    }
  }

  useEffect(() => {
    void restoreSession();
  }, [hydrate]);

  if (error) {
    return (
      <main className="startup-error" role="alert">
        <div>
          <strong>We couldn’t start MechNow.</strong>
          <p>{error}</p>
        </div>
        <button onClick={() => void restoreSession()} type="button">Try again</button>
      </main>
    );
  }
  if (!ready || !storeReady || !splashComplete) {
    return <SplashScreen onComplete={() => setSplashComplete(true)} />;
  }
  return <RouterProvider router={router} />;
}
