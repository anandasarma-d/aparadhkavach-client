/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API Gateway base URL (no trailing slash). Browser → Gateway only (C8). */
  readonly VITE_API_GATEWAY_URL: string;
  /** Show demo role picker (requires Auth AUTH_ALLOW_DEV_MINT=true). Default off. */
  readonly VITE_ALLOW_DEV_MINT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
