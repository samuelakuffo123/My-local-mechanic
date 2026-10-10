import { useEffect } from "react";
import { RouterProvider } from "react-router";
import { router } from "./routes";
import { useAppStore } from "../state/store";

export default function App() {
  const hydrate = useAppStore((state) => state.hydrate);
  useEffect(() => {
    void hydrate();
  }, [hydrate]);
  return <RouterProvider router={router} />;
}
