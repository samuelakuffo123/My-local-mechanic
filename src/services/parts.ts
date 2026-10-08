import { mockRequest, readPersisted, writePersisted } from "./mockApi";
export interface Product { id: string; vendorId: string; name: string; priceGhs: number; compatibleVehicleIds: string[] }
export const partsService = {
  search: (query: string) => mockRequest(() => readPersisted<Product[]>("products", []).filter((item) => item.name.toLowerCase().includes(query.toLowerCase()))),
  saveCart: (items: { productId: string; quantity: number }[]) => mockRequest(() => writePersisted("cart", items), { failureRate: 0 }),
};
