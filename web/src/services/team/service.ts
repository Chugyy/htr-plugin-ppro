import { apiFetch } from "@/lib/api-client";
import type { TeamMemberResponse, InviteRequest, AddSeatsRequest } from "./types";

export async function listMembers(): Promise<TeamMemberResponse[]> {
  const res = await apiFetch("/api/team/members");
  if (!res.ok) throw new Error("Failed to fetch team members");
  return res.json();
}

export async function inviteMember(data: InviteRequest): Promise<void> {
  const res = await apiFetch("/api/team/invite", {
    method: "POST",
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error((await res.json()).detail ?? "Invite failed");
}

export async function removeMember(userId: number): Promise<void> {
  const res = await apiFetch(`/api/team/members/${userId}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to remove member");
}

export async function addSeats(data: AddSeatsRequest): Promise<void> {
  const res = await apiFetch("/api/team/seats", {
    method: "POST",
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error((await res.json()).detail ?? "Failed to add seats");
}
