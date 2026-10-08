export type Role = "driver" | "mechanic" | "tow" | "vendor" | "admin";
export type Theme = "light" | "dark";

export interface User {
  id: string;
  name: string;
  phone: string;
  email: string;
  role: Role;
}

export interface Vehicle {
  id: string;
  make: string;
  model: string;
  year: number;
  plate: string;
  mileageKm: number;
  primary: boolean;
}

export interface CartItem {
  productId: string;
  vendorId: string;
  quantity: number;
}

export interface Notification {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
}
