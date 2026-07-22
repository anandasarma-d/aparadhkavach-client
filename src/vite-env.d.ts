/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_GATEWAY_URL: string;
  /** Investigation Service base URL (no trailing slash). Local C1 default: http://localhost:8080 */
  readonly VITE_INVESTIGATION_SERVICE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
