"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { login, register, logout, forgotPassword, resetPassword, getMe } from "./service";
import type {
  LoginRequest,
  RegisterRequest,
  ForgotPasswordRequest,
  ResetPasswordRequest,
} from "./types";

export function useMe() {
  return useQuery({ queryKey: ["me"], queryFn: getMe, retry: false });
}

export function useLogin() {
  return useMutation({ mutationFn: (data: LoginRequest) => login(data) });
}

export function useRegister() {
  return useMutation({ mutationFn: (data: RegisterRequest) => register(data) });
}

export function useLogout() {
  return useMutation({ mutationFn: logout });
}

export function useForgotPassword() {
  return useMutation({
    mutationFn: (data: ForgotPasswordRequest) => forgotPassword(data),
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: (data: ResetPasswordRequest) => resetPassword(data),
  });
}
