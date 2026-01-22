import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "./client";

export type InventoryStats = {
  inward: { [key: string]: number; total: number };
  outward: { [key: string]: number; total: number };
  instock: { [key: string]: number; total: number };
  used: { [key: string]: number; total: number };
};

export type InventoryLog = {
  id: string;
  type: "INWARD" | "OUTWARD";
  stateCode: string;
  oemCode: string;
  productCode: string;
  quantity: number;
  serialStart?: string;
  serialEnd?: string;
  remark?: string;
  dealer?: { name: string };
  createdAt: string;
  userId?: string;
};

export type InventoryFilters = {
  stateCode?: string;
  oemCode?: string;
  startDate?: string;
  endDate?: string;
};

export function useInventoryStats(filters: InventoryFilters) {
  return useQuery({
    queryKey: ["inventory-stats", filters],
    queryFn: async () => {
      const res = await api.get<InventoryStats>("/inventory/stats", { params: filters });
      return res.data;
    },
  });
}

export function useInventoryLogs(filters: InventoryFilters) {
  return useQuery({
    queryKey: ["inventory-logs", filters],
    queryFn: async () => {
      const res = await api.get<InventoryLog[]>("/inventory/logs", { params: filters });
      return res.data;
    },
  });
}

export function useCreateOutward() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => {
      const res = await api.post("/inventory/outward", data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory-stats"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-logs"] });
    },
  });
}
