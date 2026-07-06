export interface Env {
  // Bindings
  DB: D1Database;
  CERTIFICATES: R2Bucket;
  CACHE: KVNamespace;

  // Configuration (non-secret vars)
  R2_PUBLIC_URL: string;
  PUBLIC_BASE_URL: string;
  FRONTEND_URL: string;
  ZEPTOMAIL_FROM_EMAIL: string;
  WHATSAPP_TEMPLATE_NAME: string;
  WHATSAPP_TEMPLATE_LANGUAGE: string;
  VITE_CERT_GENERATION_RATE: string;
  VITE_CERT_REGENERATION_RATE: string;
  CREDITS_PER_RUPEE: string;
  CREDIT_COST_EMAIL: string;
  CREDIT_COST_WHATSAPP: string;
  MIN_RECHARGE_AMOUNT: string;
  R2_ACCOUNT_ID: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_BUCKET_NAME: string;

  // Secrets (injected at runtime)
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SUPABASE_JWT_SECRET: string;
  ZEPTOMAIL_TOKEN: string;
  WHATSAPP_PHONE_NUMBER_ID: string;
  WHATSAPP_ACCESS_TOKEN: string;
  CASHFREE_APP_ID: string;
  CASHFREE_SECRET_KEY: string;
  VITE_CASHFREE_ENV: string;
  WORKER_TO_API_TOKEN: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GOOGLE_REDIRECT_URI: string;
  WA_WORKER_URL: string;
  WA_ANALYTICS_TOKEN: string;
}

declare global {
  // Extend Hono's context types
  type ContextEnv = {
    Bindings: Env;
    Variables: {
      user?: {
        uid: string;
        email?: string;
      };
      workspace?: {
        id: string;
        role: 'owner' | 'admin' | 'member';
      };
    };
  };
}
