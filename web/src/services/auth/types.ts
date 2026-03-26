export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
  invite_token?: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  token: string;
  new_password: string;
}

export interface UserOut {
  id: number;
  name: string;
  email: string;
  plan: "starter" | "pro" | "agency";
  role: "owner" | "member";
}
