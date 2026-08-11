import { createBrowserClient } from '@supabase/ssr';

const SUPABASE_URL = 'https://glpemdsqzcawrlnryppn.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdscGVtZHNxemNhd3JsbnJ5cHBuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxOTQ4NTQsImV4cCI6MjEwMTc3MDg1NH0.OPVwRikfWlQhtnt5XcKH_YmFkkumsuycQ_AL2962mWM';

export const supabaseBrowserClient = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
