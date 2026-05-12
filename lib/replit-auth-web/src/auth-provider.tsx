import { AuthContext, useAuthState } from "./use-auth";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const state = useAuthState();
  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}
