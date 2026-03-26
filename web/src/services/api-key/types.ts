export interface ApiKeyResponse {
  id: number;
  name: string;
  key: string;
  createdAt: string;
  lastUsedAt: string | null;
  isActive?: boolean;
}

export interface ApiKeyCreateRequest {
  name: string;
}
