import { lazy, Suspense, type ReactNode } from "react";
import { createBrowserRouter, Navigate } from "react-router";
import { RouteGuard } from "./RouteGuard";

const AdminRoute = lazy(() => import("../features/admin/AdminRoute").then((module) => ({ default: module.AdminRoute })));
const ActivityRoute = lazy(() => import("../features/activity/ActivityRoute").then((module) => ({ default: module.ActivityRoute })));
const AuthPlaceholder = lazy(() => import("../features/auth/AuthPlaceholder").then((module) => ({ default: module.AuthPlaceholder })));
const BookingRoute = lazy(() => import("../features/booking/BookingRoute").then((module) => ({ default: module.BookingRoute })));
const ChatRoute = lazy(() => import("../features/chat/ChatRoute").then((module) => ({ default: module.ChatRoute })));
const EmergencyRoute = lazy(() => import("../features/emergency/EmergencyRoute").then((module) => ({ default: module.EmergencyRoute })));
const FeatureRoute = lazy(() => import("../features/explore/FeatureRoute").then((module) => ({ default: module.FeatureRoute })));
const DriverRoute = lazy(() => import("../features/home/DriverRoute").then((module) => ({ default: module.DriverRoute })));
const SplashScreen = lazy(() => import("../features/landing/SplashScreen"));
const OnboardingPlaceholder = lazy(() => import("../features/onboarding/OnboardingPlaceholder").then((module) => ({ default: module.OnboardingPlaceholder })));
const PartsRoute = lazy(() => import("../features/parts/PartsRoute").then((module) => ({ default: module.PartsRoute })));
const ProfileRoute = lazy(() => import("../features/profile/ProfileRoute").then((module) => ({ default: module.ProfileRoute })));
const ProviderRoute = lazy(() => import("../features/provider/ProviderRoute").then((module) => ({ default: module.ProviderRoute })));
const TowRoute = lazy(() => import("../features/tow/TowRoute").then((module) => ({ default: module.TowRoute })));
const VehiclesRoute = lazy(() => import("../features/vehicles/VehiclesRoute").then((module) => ({ default: module.VehiclesRoute })));

const pending = <div className="route-loading" role="status">Loading MechNow…</div>;
const load = (element: ReactNode) => <Suspense fallback={pending}>{element}</Suspense>;
const driver = (element: ReactNode) => <RouteGuard allowed={["driver"]}>{load(element)}</RouteGuard>;

export const router = createBrowserRouter([
  { path: "/", element: load(<SplashScreen />) },
  { path: "/welcome", element: load(<OnboardingPlaceholder />) },
  { path: "/signup", element: load(<AuthPlaceholder />) },
  { path: "/verify", element: load(<AuthPlaceholder />) },
  { path: "/login", element: load(<AuthPlaceholder />) },
  { path: "/onboarding/*", element: load(<OnboardingPlaceholder />) },
  { path: "/app/home", element: driver(<DriverRoute />) },
  { path: "/app/explore", element: load(<FeatureRoute start="explore" />) },
  { path: "/app/services", element: driver(<FeatureRoute start="hub" />) },
  { path: "/app/activity", element: driver(<ActivityRoute />) },
  { path: "/app/profile", element: driver(<ProfileRoute />) },
  { path: "/app/emergency/*", element: driver(<EmergencyRoute />) },
  { path: "/app/tow/*", element: driver(<TowRoute />) },
  { path: "/app/parts/*", element: driver(<PartsRoute />) },
  { path: "/app/book/*", element: driver(<BookingRoute />) },
  { path: "/app/chat/*", element: driver(<ChatRoute />) },
  { path: "/app/vehicles/*", element: driver(<VehiclesRoute />) },
  { path: "/pro/:role?/*", element: <RouteGuard allowed={["mechanic", "tow", "vendor"]}>{load(<ProviderRoute />)}</RouteGuard> },
  { path: "/admin/*", element: <RouteGuard allowed={["admin"]}>{load(<AdminRoute />)}</RouteGuard> },
  { path: "*", element: <Navigate replace to="/" /> },
]);
