"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listMembers, inviteMember, removeMember, addSeats } from "./service";
import { queryKeys } from "@/lib/query-keys";
import type { InviteRequest, AddSeatsRequest } from "./types";

export function useTeamMembers() {
  return useQuery({
    queryKey: queryKeys.teamMembers,
    queryFn: listMembers,
    staleTime: 5 * 60 * 1000,
  });
}

export function useInviteMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: InviteRequest) => inviteMember(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.teamMembers }),
  });
}

export function useRemoveMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: number) => removeMember(userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.teamMembers }),
  });
}

export function useAddSeats() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: AddSeatsRequest) => addSeats(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.teamMembers });
      qc.invalidateQueries({ queryKey: queryKeys.billingStatus });
    },
  });
}
