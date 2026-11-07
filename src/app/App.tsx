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
      setError(cause instanceof Error ? cause.message : "The API session could not be restored.");
    }
  }

  useEffect(() => {
    void restoreSession();
  }, [hydrate]);

  if (error) {
    return (
      <main className="startup-error">
        <p>{error}</p>
        <button onClick={() => void restoreSession()} type="button">Try again</button>
      </main>
    );
  }
  if (!ready || !storeReady || !splashComplete) {
    return <SplashScreen onComplete={() => setSplashComplete(true)} />;
  }
  return <RouterProvider router={router} />;
}
