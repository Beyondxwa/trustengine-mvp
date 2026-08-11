// File: src/lib/store.ts
// Purpose: Global state management with Zustand
// Depends on: zustand

import { create } from 'zustand';

interface AuthState {
  user: any | null;
  session: any | null;
  isLoading: boolean;
  setUser: (user: any | null) => void;
  setSession: (session: any | null) => void;
  setLoading: (loading: boolean) => void;
  signOut: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  session: null,
  isLoading: true,
  setUser: (user) => set({ user }),
  setSession: (session) => set({ session }),
  setLoading: (isLoading) => set({ isLoading }),
  signOut: () => set({ user: null, session: null }),
}));

interface TenantState {
  tenantId: string | null;
  tenantName: string | null;
  primaryColor: string;
  secondaryColor: string;
  setTenant: (tenant: { id: string; name: string; primaryColor?: string; secondaryColor?: string }) => void;
  clearTenant: () => void;
}

export const useTenantStore = create<TenantState>((set) => ({
  tenantId: null,
  tenantName: null,
  primaryColor: '#3B82F6',
  secondaryColor: '#10B981',
  setTenant: (tenant) =>
    set({
      tenantId: tenant.id,
      tenantName: tenant.name,
      primaryColor: tenant.primaryColor || '#3B82F6',
      secondaryColor: tenant.secondaryColor || '#10B981',
    }),
  clearTenant: () =>
    set({
      tenantId: null,
      tenantName: null,
      primaryColor: '#3B82F6',
      secondaryColor: '#10B981',
    }),
}));

interface UIState {
  isOffline: boolean;
  setOffline: (offline: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  isOffline: false,
  setOffline: (isOffline) => set({ isOffline }),
}));
