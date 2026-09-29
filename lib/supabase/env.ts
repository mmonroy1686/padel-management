export type SupabaseEnv = { url: string; publishableKey: string }

export function getSupabaseEnv(): SupabaseEnv {
  // Read each variable by its literal name so Next inlines them in the browser bundle.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

  if (!url) {
    throw new Error('Falta NEXT_PUBLIC_SUPABASE_URL. Copiala de `supabase status` a .env.local.')
  }
  if (!publishableKey) {
    throw new Error('Falta NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Copiala de `supabase status` a .env.local.')
  }

  return { url, publishableKey }
}
