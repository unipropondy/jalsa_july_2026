import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_URL } from "../constants/Config";

export interface GeneralSettings {
  enableKOT: boolean;
  enableKDS: boolean;
  enableCheckoutBill: boolean;
  enableCheckoutFlow: boolean;
  enableDirectProcessToPay: boolean;
  customerSideDisplay: boolean;
}

interface GeneralSettingsState {
  settings: GeneralSettings;
  loading: boolean;
  fetchSettings: () => Promise<void>;
  updateSettings: (newSettings: Partial<GeneralSettings>) => Promise<boolean>;
}

export const useGeneralSettingsStore = create<GeneralSettingsState>()(
  persist(
    (set, get) => ({
      settings: {
        enableKOT: true,
        enableKDS: true,
        enableCheckoutBill: true,
        enableCheckoutFlow: true,
        enableDirectProcessToPay: false,
        customerSideDisplay: true,
      },
      loading: false,

      fetchSettings: async () => {
        set({ loading: true });
        try {
          const response = await fetch(`${API_URL}/api/settings`);
          const data = await response.json();
          
          if (data) {
            set((state) => ({
              settings: {
                ...state.settings,
                enableKOT: data.EnableKOT !== undefined ? Boolean(data.EnableKOT) : true,
                enableKDS: data.EnableKDS !== undefined ? Boolean(data.EnableKDS) : true,
                enableCheckoutBill: data.EnableCheckoutBill !== undefined ? Boolean(data.EnableCheckoutBill) : true,
                enableCheckoutFlow: data.EnableCheckoutFlow !== undefined ? Boolean(data.EnableCheckoutFlow) : true,
                enableDirectProcessToPay: data.EnableDirectProcessToPay !== undefined ? Boolean(data.EnableDirectProcessToPay) : false,
                customerSideDisplay: data.CustomerSideDisplay !== undefined ? Boolean(data.CustomerSideDisplay) : true,
              },
            }));
          }
        } catch (error) {
          console.error("❌ [GeneralSettingsStore] Fetch Error:", error);
        } finally {
          set({ loading: false });
        }
      },

      updateSettings: async (newSettings) => {
        const previousSettings = get().settings;
        const updatedSettings = { ...previousSettings, ...newSettings };
        
        // Optimistic UI update
        set({ settings: updatedSettings, loading: true });

        try {
          // Fetch existing payment settings so we don't overwrite them with null in the API call
          // Since the backend uses an UPSERT that expects all fields, we must fetch current first or rely on the backend ignoring nulls.
          // Wait, backend does `.input("UPI", sql.NVarChar, upiId || null)` which could set it to null if we don't pass it.
          // Let's fetch current settings first
          const getRes = await fetch(`${API_URL}/api/settings`);
          const currentData = await getRes.json();
          
          const payload = {
            upiId: currentData.UPI_ID,
            shopName: currentData.ShopName,
            qrCodeUrl: currentData.PayNow_QR_Url,
            enableKOT: updatedSettings.enableKOT,
            enableKDS: updatedSettings.enableKDS,
            enableCheckoutBill: updatedSettings.enableCheckoutBill,
            enableCheckoutFlow: updatedSettings.enableCheckoutFlow,
            enableDirectProcessToPay: updatedSettings.enableDirectProcessToPay,
            customerSideDisplay: updatedSettings.customerSideDisplay
          };

          const res = await fetch(`${API_URL}/api/settings/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          
          if (!res.ok) throw new Error("Failed to update settings");
          
          set({ loading: false });
          return true;
        } catch (error) {
          console.error("❌ [GeneralSettingsStore] Update Error:", error);
          // Revert on failure
          set({ settings: previousSettings, loading: false });
          return false;
        }
      },
    }),
    {
      name: "general-settings-storage",
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
