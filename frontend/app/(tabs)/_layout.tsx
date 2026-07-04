import { Tabs, usePathname, useRouter } from "expo-router";
import React from "react";
import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAuthStore } from "@/stores/authStore";
import { useGeneralSettingsStore } from "@/stores/generalSettingsStore";

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const pathname = usePathname();
  const router = useRouter(); // ✅ Import router for redirection
  const user = useAuthStore((state) => state.user);
  const permissions = useAuthStore((state) => state.permissions);
  const enableKDS = useGeneralSettingsStore((state: any) => state.settings.enableKDS);

  // ✅ REDIRECTION GUARD: KDS user cannot stay in /(tabs)
  React.useEffect(() => {
    const isKdsUser = user?.userName?.toUpperCase() === "KDS" || user?.userGroupId?.toUpperCase() === "94D60EFE-B74E-42E0-85C0-FE2ED15D2297";
    if (isKdsUser && pathname.startsWith("/(tabs)")) {
      router.replace("/kds" as any);
    }
  }, [user, pathname]);

  // ✅ Show tabs ONLY inside /(tabs) screens (NOT login "/")
  // 🛑 ALSO hide tabs if user is KDS
  const isKDS = user?.userName?.toUpperCase() === "KDS" || user?.userGroupId?.toUpperCase() === "94D60EFE-B74E-42E0-85C0-FE2ED15D2297";
  const showTabs = pathname.startsWith("/(tabs)") && !isKDS && user !== null;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? "light"].tint,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: showTabs ? undefined : { display: "none" },
      }}
    >
      <Tabs.Screen
        name="category"
        options={{
          title: "POS",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={28} name="house.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="kds"
        options={{
          title: "Kitchen",
          href: enableKDS && (user?.role === "ADMIN" || user?.role === "MANAGER" || permissions["OPRSTK"]?.canRead) ? "/(tabs)/kds" : null,
          tabBarIcon: ({ color }) => (
            <IconSymbol size={28} name="fork.knife" color={color} />
          ),
        }}
      />
    </Tabs>
  );
}