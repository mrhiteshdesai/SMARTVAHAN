import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "./client";

// --- STATES ---
export type State = {
  code: string;
  name: string;
};

export function useStates() {
  return useQuery({
    queryKey: ["states"],
    queryFn: async () => {
      const res = await api.get<State[]>("/states");
      return res.data;
    },
  });
}

export function useCreateState() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: State) => {
      const res = await api.post("/states", data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["states"] });
    },
  });
}

export function useUpdateState() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ code, data }: { code: string; data: Partial<State> }) => {
      const res = await api.patch(`/states/${code}`, data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["states"] });
    },
  });
}

export function useDeleteState() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (code: string) => {
      const res = await api.delete(`/states/${code}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["states"] });
    },
  });
}

// --- RTOs ---
export type RTO = {
  code: string;
  name: string;
  stateCode: string;
};

export function useRTOs(stateCode?: string) {
  return useQuery({
    queryKey: ["rtos", stateCode],
    queryFn: async () => {
      const params = stateCode ? { stateCode } : {};
      const res = await api.get<RTO[]>("/rtos", { params });
      return res.data;
    },
    enabled: true, 
  });
}

export function useCreateRTO() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: RTO) => {
      const res = await api.post("/rtos", data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rtos"] });
    },
  });
}

export function useUpdateRTO() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ code, data }: { code: string; data: Partial<RTO> }) => {
      const res = await api.patch(`/rtos/${code}`, data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rtos"] });
    },
  });
}

export function useDeleteRTO() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (code: string) => {
      const res = await api.delete(`/rtos/${code}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rtos"] });
    },
  });
}

// --- OEMs ---
export type OEM = {
  id: string;
  name: string;
  code: string;
  logo?: string;
  copDocument?: string;
  copValidity?: string;
  authorizedStates?: string[];
};

export function useOEMs() {
  return useQuery({
    queryKey: ["oems"],
    queryFn: async () => {
      const res = await api.get<OEM[]>("/oems");
      return res.data;
    },
  });
}

export function useCreateOEM() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: FormData) => {
      const res = await api.post("/oems", data, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["oems"] });
    },
  });
}

export function useUpdateOEM() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: FormData }) => {
      const res = await api.patch(`/oems/${id}`, data, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["oems"] });
    },
  });
}

export function useDeleteOEM() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/oems/${id}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["oems"] });
    },
  });
}

// --- Dealers ---
export type Dealer = {
  id: string;
  name: string;
  phone: string;
  stateCode: string;
  rtoCode?: string;
  allRTOs?: boolean;
  status: "ACTIVE" | "INACTIVE";
  oems: OEM[];
  locationAddress?: string;
  city?: string;
  zip?: string;
  latitude?: number;
  longitude?: number;
  radius?: number;
  tradeCertificateNo?: string;
  tradeValidity?: string; // ISO Date string
  gstNo?: string;
};

export function useDealers() {
  return useQuery({
    queryKey: ["dealers"],
    queryFn: async () => {
      const res = await api.get<Dealer[]>("/dealers");
      return res.data;
    },
  });
}

export function useCreateDealer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => {
      const res = await api.post("/dealers", data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dealers"] });
    },
  });
}

export function useUpdateDealer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await api.patch(`/dealers/${id}`, data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dealers"] });
    },
  });
}

export function useDeleteDealer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/dealers/${id}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dealers"] });
    },
  });
}

// --- System Users ---
export type SystemUser = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  status: string;
};

export function useSystemUsers() {
  return useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const res = await api.get<SystemUser[]>("/users");
      return res.data;
    },
  });
}

export function useCreateSystemUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => {
      const res = await api.post("/users", data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

export function useUpdateSystemUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await api.patch(`/users/${id}`, data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

export function useDeleteSystemUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/users/${id}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

// --- Products ---
export type Product = {
  code: string;
  name: string;
};

export function useProducts() {
  return useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const res = await api.get<Product[]>("/products");
      return res.data;
    },
  });
}

export function useCreateProduct() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: Product) => {
            const res = await api.post("/products", data);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["products"] });
        }
    });
}

// --- QR Batches ---
export type Batch = {
    id: string;
    batchId: string;
    stateCode: string;
    oemCode: string;
    productCode: string;
    quantity: number;
    filePath: string;
    createdAt: string;
    state?: State;
    oem?: OEM;
    product?: Product;
};

export function useBatches() {
    return useQuery({
        queryKey: ["batches"],
        queryFn: async () => {
            const res = await api.get<Batch[]>("/qr/batches");
            return res.data;
        }
    });
}

export function useGenerateBatch() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: any) => {
            const res = await api.post("/qr/generate", data);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["batches"] });
        }
    });
}

export function useRegenerateBatch() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: any) => {
            const res = await api.post("/qr/regenerate", data);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["batches"] });
        }
    });
}

export function useBulkReplacement() {
    return useMutation({
        mutationFn: async (data: { serials: number[], stateCode: string, oemCode: string }) => {
            const res = await api.post("/qr/bulk-replacement", data, {
                responseType: 'blob'
            });
            // Return blob and custom headers
            return {
                data: res.data,
                count: res.headers['x-processed-count'],
                skipped: res.headers['x-skipped-count']
            };
        }
    });
}

// --- Vehicle Categories ---
export type VehicleCategory = {
  id: string;
  name: string;
};

export function useVehicleCategories() {
  return useQuery({
    queryKey: ["vehicleCategories"],
    queryFn: async () => {
      const res = await api.get<VehicleCategory[]>("/vehicle-categories");
      return res.data;
    },
  });
}

// --- Dashboard Stats ---
export type DashboardStats = {
    row1: Record<string, number>;
    row2: {
        today: number;
        yesterday: number;
        thisWeek: number;
    };
    row3: {
        totalQrIssued: number;
        totalQrUsed: number;
        totalCerts: number;
        totalActiveDealers: number;
    };
    row4: Record<string, { issued: number; used: number }>;
    barData: Array<{ date: string; [key: string]: any }>;
    oemBarData: Array<{ date: string; [key: string]: any }>;
    oemPerformance: Array<{ oem: string; count: number }>;
    rtoDensity: Array<{ rto: string; count: number }>;
    heatmapData: Array<{ lat: number; lng: number; weight: number }>;
};

export function useDashboardStats(filters: { stateCode?: string; oemCode?: string; startDate?: string; endDate?: string }) {
    return useQuery({
        queryKey: ["dashboardStats", filters],
        queryFn: async () => {
            const res = await api.get<DashboardStats>("/stats/dashboard", { params: filters });
            return res.data;
        }
    });
}

export function useSystemSettings() {
    return useQuery({
        queryKey: ["systemSettings"],
        queryFn: async () => {
            const res = await api.get("/settings");
            return res.data;
        }
    });
}
