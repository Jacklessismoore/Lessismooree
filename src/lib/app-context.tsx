'use client';

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { Pod, Manager, Designer, KlaviyoTech, Scheduler, Brand } from './types';
import { getPods, getBrands, getManagers, getDesigners, getKlaviyoTechs, getSchedulers } from './db';
import { useAuth } from './auth-context';

interface AppContextType {
  pods: Pod[];
  managers: Manager[];
  designers: Designer[];
  klaviyoTechs: KlaviyoTech[];
  schedulers: Scheduler[];
  brands: Brand[];
  selectedPod: Pod | null;
  selectedClient: Brand | null;
  setSelectedPod: (pod: Pod | null) => void;
  setSelectedClient: (brand: Brand | null) => void;
  refreshPods: () => Promise<void>;
  refreshManagers: () => Promise<void>;
  refreshDesigners: () => Promise<void>;
  refreshKlaviyoTechs: () => Promise<void>;
  refreshSchedulers: () => Promise<void>;
  refreshBrands: () => Promise<void>;
  podBrands: Brand[];
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [pods, setPods] = useState<Pod[]>([]);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [designers, setDesigners] = useState<Designer[]>([]);
  const [klaviyoTechs, setKlaviyoTechs] = useState<KlaviyoTech[]>([]);
  const [schedulers, setSchedulers] = useState<Scheduler[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selectedPod, setSelectedPodState] = useState<Pod | null>(null);
  const [selectedClient, setSelectedClientState] = useState<Brand | null>(null);

  const refreshPods = useCallback(async () => {
    try {
      const data = await getPods();
      setPods(data);
    } catch (e) {
      console.error('Failed to fetch pods:', e);
    }
  }, []);

  const refreshManagers = useCallback(async () => {
    try {
      const data = await getManagers();
      setManagers(data);
    } catch (e) {
      console.error('Failed to fetch managers:', e);
    }
  }, []);

  const refreshDesigners = useCallback(async () => {
    try {
      const data = await getDesigners();
      setDesigners(data);
    } catch (e) {
      console.error('Failed to fetch designers:', e);
    }
  }, []);

  const refreshKlaviyoTechs = useCallback(async () => {
    try {
      const data = await getKlaviyoTechs();
      setKlaviyoTechs(data);
    } catch (e) {
      console.error('Failed to fetch klaviyo techs:', e);
    }
  }, []);

  const refreshSchedulers = useCallback(async () => {
    try {
      const data = await getSchedulers();
      setSchedulers(data);
    } catch (e) {
      console.error('Failed to fetch schedulers:', e);
    }
  }, []);

  const refreshBrands = useCallback(async () => {
    try {
      const data = await getBrands();
      setBrands(data);
    } catch (e) {
      console.error('Failed to fetch brands:', e);
    }
  }, []);

  // Load initial data when user logs in
  useEffect(() => {
    if (user) {
      refreshPods();
      refreshManagers();
      refreshDesigners();
      refreshKlaviyoTechs();
      refreshSchedulers();
      refreshBrands();
    }
  }, [user, refreshPods, refreshManagers, refreshDesigners, refreshKlaviyoTechs, refreshSchedulers, refreshBrands]);

  // Restore selected pod/client from localStorage
  useEffect(() => {
    if (pods.length > 0 && !selectedPod) {
      const savedPodId = localStorage.getItem('lim-selected-pod');
      const pod = savedPodId ? pods.find(p => p.id === savedPodId) : pods[0];
      if (pod) setSelectedPodState(pod);
    }
  }, [pods, selectedPod]);

  useEffect(() => {
    if (brands.length > 0 && selectedPod && !selectedClient) {
      const savedClientId = localStorage.getItem('lim-selected-client');
      if (savedClientId) {
        const brand = brands.find(b => b.id === savedClientId && b.pod_id === selectedPod.id);
        if (brand) setSelectedClientState(brand);
      }
    }
  }, [brands, selectedPod, selectedClient]);

  const setSelectedPod = (pod: Pod | null) => {
    setSelectedPodState(pod);
    setSelectedClientState(null);
    if (pod) localStorage.setItem('lim-selected-pod', pod.id);
    else localStorage.removeItem('lim-selected-pod');
    localStorage.removeItem('lim-selected-client');
  };

  const setSelectedClient = (brand: Brand | null) => {
    setSelectedClientState(brand);
    if (brand) localStorage.setItem('lim-selected-client', brand.id);
    else localStorage.removeItem('lim-selected-client');
  };

  const podBrands = selectedPod
    ? brands.filter(b => b.pod_id === selectedPod.id)
    : [];

  return (
    <AppContext.Provider value={{
      pods, managers, designers, klaviyoTechs, schedulers, brands, selectedPod, selectedClient,
      setSelectedPod, setSelectedClient,
      refreshPods, refreshManagers, refreshDesigners, refreshKlaviyoTechs, refreshSchedulers, refreshBrands,
      podBrands,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
