import { apiRequest } from "./api";
export interface Product { id: string; vendorId: string; name: string; priceGhs: number; compatibleVehicleIds: string[] }
export const partsService = {
  search: (query: string) => apiRequest<Product[]>(`/parts?q=${encodeURIComponent(query)}`),
  getCart: () => apiRequest<{ productId: string; quantity: number }[]>("/cart"),
  saveCart: (items: { productId: string; quantity: number }[]) =>
    apiRequest<{ productId: string; quantity: number }[]>("/cart", { method: "PUT", body: { items } }),
};
