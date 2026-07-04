import { Redirect } from "expo-router";
import { useAuthStore } from "../stores/authStore";

export default function Index() {
  const { user, loginDate, logout } = useAuthStore();

  if (user) {
    const currentDate = new Date().toISOString().split("T")[0];
    if (loginDate && currentDate !== loginDate) {
      logout();
      return <Redirect href="/login" />;
    }

    const userName = (user.userName || "").trim().toUpperCase();
    const isKdsUser = userName === "KDS" || user.userGroupId?.toUpperCase() === "94D60EFE-B74E-42E0-85C0-FE2ED15D2297";
    if (isKdsUser) {
      return <Redirect href="/(tabs)/kds" />;
    }
    return <Redirect href="/(tabs)/category" />;
  }

  return <Redirect href="/login" />;
}
