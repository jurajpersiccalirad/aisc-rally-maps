import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { newId } from '../lib/id';

export interface Device {
  id: string;
  serialNumber: string;
  name: string;
}

interface DeviceStore {
  devices: Device[];
  addDevice: (d: Omit<Device, 'id'>) => void;
  updateDevice: (id: string, patch: Partial<Omit<Device, 'id'>>) => void;
  removeDevice: (id: string) => void;
}

export const useDeviceStore = create<DeviceStore>()(
  persist(
    (set) => ({
      devices: [],
      addDevice: (d) =>
        set((s) => ({ devices: [...s.devices, { id: newId(), ...d }] })),
      updateDevice: (id, patch) =>
        set((s) => ({
          devices: s.devices.map((d) => (d.id === id ? { ...d, ...patch } : d)),
        })),
      removeDevice: (id) =>
        set((s) => ({ devices: s.devices.filter((d) => d.id !== id) })),
    }),
    { name: 'aisc-devices' },
  ),
);
