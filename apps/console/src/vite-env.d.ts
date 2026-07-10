/// <reference types="vite/client" />

// Typed Console build-time env vars (so `import.meta.env.VITE_*` is a typed string, never `any`).
interface ImportMetaEnv {
  /** The deployment environment name shown in the env badge (default: development). */
  readonly VITE_FC_ENV?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
