import type { Notification, User, Vehicle } from "./types";

const currentYear = new Date().getFullYear();

export const seedUser: User = {
  id: "user-kwame",
  name: "Kwame Asante",
  phone: "+233 24 123 4567",
  email: "kwame.asante@example.com",
  role: "driver",
};

export const seedVehicle: Vehicle = {
  id: "vehicle-corolla",
  make: "Toyota",
  model: "Corolla",
  year: currentYear - 4,
  plate: "GR 8241-22",
  mileageKm: 42180,
  primary: true,
};

export const seedNotifications: Notification[] = [
  {
    id: "notification-maintenance",
    title: "Service reminder",
    body: "Your Corolla is due for service in 1,820 km.",
    createdAt: new Date(Date.now() - 36e5).toISOString(),
    read: false,
  },
];
