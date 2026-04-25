import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

/**
 * Single source of truth for "is this the desktop / Electron build, and what
 * version are we?". Read via `useEnvironment()`.
 *
 * Detection: presence of `window.electronAPI` (set by preload). The IPC fields
 * (machineId / version / platform) are fetched lazily once on mount.
 */
export interface EnvironmentValue {
  isDesktop: boolean;
  machineId: string | null;
  appVersion: string | null;
  platform: string | null;
}

const EnvironmentContext = createContext<EnvironmentValue>({
  isDesktop: false,
  machineId: null,
  appVersion: null,
  platform: null,
});

export const EnvironmentProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const isDesktop = typeof window !== 'undefined' && !!window.electronAPI;
  const [machineId, setMachineId] = useState<string | null>(null);
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [platform, setPlatform] = useState<string | null>(null);

  useEffect(() => {
    if (!isDesktop) return;
    const api = window.electronAPI!;
    api.getMachineId().then(setMachineId).catch(() => setMachineId(null));
    api.getAppVersion().then(setAppVersion).catch(() => setAppVersion(null));
    api.getPlatform().then(setPlatform).catch(() => setPlatform(null));
  }, [isDesktop]);

  const value = useMemo(
    () => ({ isDesktop, machineId, appVersion, platform }),
    [isDesktop, machineId, appVersion, platform],
  );

  return <EnvironmentContext.Provider value={value}>{children}</EnvironmentContext.Provider>;
};

export function useEnvironment(): EnvironmentValue {
  return useContext(EnvironmentContext);
}

/** Open a URL — uses Electron shell.openExternal in desktop, window.open in web. */
export function openExternalUrl(url: string): void {
  if (typeof window !== 'undefined' && window.electronAPI?.openExternal) {
    window.electronAPI.openExternal(url).catch(() => window.open(url, '_blank'));
    return;
  }
  window.open(url, '_blank');
}
