export type TeamRole = "owner" | "member";

export interface TeamMemberResponse {
  user_id: number;
  name: string;
  email: string;
  role: TeamRole;
  usage_this_month: number;
}

export interface InviteRequest {
  email: string;
}

export interface AddSeatsRequest {
  quantity: number;
}
