export const queryKeys = {
  billingStatus: ["billing-status"] as const,
  apiKeys: ["api-keys"] as const,
  usageCurrent: (apiKeyId?: number) => ["usage-current", apiKeyId] as const,
  teamMembers: ["team-members"] as const,
  plans: ["plans"] as const,
};
