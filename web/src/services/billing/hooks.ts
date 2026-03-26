"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { getBillingStatus, createCheckout, createPortal } from "./service";
import { queryKeys } from "@/lib/query-keys";
import type { CheckoutRequest, PortalRequest } from "./types";

export function useBillingStatus() {
  return useQuery({
    queryKey: queryKeys.billingStatus,
    queryFn: getBillingStatus,
    staleTime: 30 * 1000,
  });
}

export function useCreateCheckout() {
  return useMutation({
    mutationFn: (data: CheckoutRequest) => createCheckout(data),
  });
}

export function useCreatePortal() {
  return useMutation({
    mutationFn: (data?: PortalRequest) => createPortal(data),
  });
}
