/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API Gateway base URL (no trailing slash). Browser → Gateway only (C8). */
  readonly VITE_API_GATEWAY_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
