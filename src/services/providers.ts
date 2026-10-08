import { mockRequest } from "./mockApi";

export interface Provider {
  id: string; name: string; type: "mechanic" | "tow" | "vendor"; distanceKm: number;
  etaMinutes: number; rating: number; reliability: number; services: string[]; phone: string;
}

const providers: Provider[] = Array.from({ length: 6 }, (_, index) => ({
  id: `provider-${index + 1}`,
  name: ["Kojo AutoCare", "Nii's Mobile Garage", "Adom Motors", "RoadLift Ghana", "Tema Motor Works", "Akwaaba Auto"][index],
  type: index === 3 ? "tow" : "mechanic",
  distanceKm: 1.8 + index * .7,
  etaMinutes: 7 + index * 2,
  rating: 4.9 - index * .08,
  reliability: 96 - index * 2,
  services: ["diagnostics", "battery", "brakes"],
  phone: "+233 24 123 4567",
}));

export const providerService = {
  list: (radiusKm = 5) => mockRequest(() => providers.filter((item) => item.distanceKm <= radiusKm)),
  get: (id: string) => mockRequest(() => providers.find((item) => item.id === id) ?? null),
};
