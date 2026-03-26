import { apiFetch } from "@/lib/api-client";
import type {
  LoginRequest,
  RegisterRequest,
  ForgotPasswordRequest,
  ResetPasswordRequest,
  UserOut,
} from "./types";

export async function login(data: LoginRequest): Promise<UserOut> {
  const res = await apiFetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error((await res.json()).detail ?? "Login failed");
  return res.json();
}

export async function register(data: RegisterRequest): Promise<UserOut> {
  const res = await apiFetch("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error((await res.json()).detail ?? "Registration failed");
  return res.json();
}

export async function logout(): Promise<void> {
  await apiFetch("/api/auth/logout", { method: "POST" });
}

export async function forgotPassword(data: ForgotPasswordRequest): Promise<void> {
  const res = await apiFetch("/api/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Request failed");
}

export async function resetPassword(data: ResetPasswordRequest): Promise<void> {
  const res = await apiFetch("/api/auth/reset-password", {
    method: "POST",
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error((await res.json()).detail ?? "Reset failed");
}

export async function getMe(): Promise<UserOut> {
  const res = await apiFetch("/api/auth/me");
  if (!res.ok) throw new Error("Failed to fetch user");
  return res.json();
}
