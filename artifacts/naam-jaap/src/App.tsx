import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/lib/theme-provider";
import { LanguageProvider } from "@/lib/language-context";
import { AuthProvider } from "@workspace/replit-auth-web";
import { RequireAuth, RequireProfileAndApproval, RequireSankalp, RequireAdmin } from "@/components/auth-guards";
import { Layout } from "@/components/layout";

import LandingPage from "@/pages/landing";
import NotFound from "@/pages/not-found";
import OnboardingPage from "@/pages/onboarding";
import PendingPage from "@/pages/pending";
import SankalpPage from "@/pages/sankalp";
import JaapPage from "@/pages/jaap";
import DashboardPage from "@/pages/dashboard";
import LeaderboardPage from "@/pages/leaderboard";
import WalletPage from "@/pages/wallet";
import SankalpHistoryPage from "@/pages/sankalp-history";
import ProfilePage from "@/pages/profile";
import AdminPage from "@/pages/admin";
import MeraSankalpPage from "@/pages/mera-sankalp";
import SankalpBoardPage from "@/pages/sankalp-board";
import AdminPayoutsPage from "@/pages/admin-payouts";
import ForgotPasswordPage from "@/pages/forgot-password";
import ResetPasswordPage from "@/pages/reset-password";
import NiyamPage from "@/pages/niyam";
import ContactPage from "@/pages/contact";
import NijJaapPage from "@/pages/nij-jaap";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // AbortError happens when TanStack Query cancels in-flight requests on
      // refetch/unmount — this is expected behaviour, not a real error.
      throwOnError: (err) => {
        if (err instanceof Error && err.name === "AbortError") return false;
        return true;
      },
      retry: (failureCount, err) => {
        if (err instanceof Error && err.name === "AbortError") return false;
        return failureCount < 3;
      },
    },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/">
        <LandingPage />
      </Route>
      
      <Route path="/onboarding">
        <RequireAuth>
          <OnboardingPage />
        </RequireAuth>
      </Route>
      
      <Route path="/pending">
        <RequireAuth>
          <PendingPage />
        </RequireAuth>
      </Route>

      <Route path="/sankalp">
        <RequireAuth>
          <RequireProfileAndApproval>
            <SankalpPage />
          </RequireProfileAndApproval>
        </RequireAuth>
      </Route>

      <Route path="/nij-jaap">
        <RequireAuth>
          <RequireProfileAndApproval>
            <RequireSankalp>
              <Layout>
                <NijJaapPage />
              </Layout>
            </RequireSankalp>
          </RequireProfileAndApproval>
        </RequireAuth>
      </Route>

      <Route path="/jaap">
        <RequireAuth>
          <RequireProfileAndApproval>
            <RequireSankalp>
              <Layout>
                <JaapPage />
              </Layout>
            </RequireSankalp>
          </RequireProfileAndApproval>
        </RequireAuth>
      </Route>

      <Route path="/dashboard">
        <RequireAuth>
          <RequireProfileAndApproval>
            <RequireSankalp>
              <Layout>
                <DashboardPage />
              </Layout>
            </RequireSankalp>
          </RequireProfileAndApproval>
        </RequireAuth>
      </Route>

      <Route path="/leaderboard">
        <RequireAuth>
          <RequireProfileAndApproval>
            <RequireSankalp>
              <Layout>
                <LeaderboardPage />
              </Layout>
            </RequireSankalp>
          </RequireProfileAndApproval>
        </RequireAuth>
      </Route>

      <Route path="/wallet">
        <RequireAuth>
          <RequireProfileAndApproval>
            <RequireSankalp>
              <Layout>
                <WalletPage />
              </Layout>
            </RequireSankalp>
          </RequireProfileAndApproval>
        </RequireAuth>
      </Route>

      <Route path="/sankalp-history">
        <RequireAuth>
          <RequireProfileAndApproval>
            <RequireSankalp>
              <Layout>
                <SankalpHistoryPage />
              </Layout>
            </RequireSankalp>
          </RequireProfileAndApproval>
        </RequireAuth>
      </Route>

      <Route path="/sankalp-board">
        <RequireAuth>
          <RequireProfileAndApproval>
            <RequireSankalp>
              <Layout>
                <SankalpBoardPage />
              </Layout>
            </RequireSankalp>
          </RequireProfileAndApproval>
        </RequireAuth>
      </Route>

      <Route path="/profile">
        <RequireAuth>
          <RequireProfileAndApproval>
            <Layout>
              <ProfilePage />
            </Layout>
          </RequireProfileAndApproval>
        </RequireAuth>
      </Route>

      <Route path="/admin">
        <RequireAuth>
          <RequireProfileAndApproval>
            <RequireAdmin>
              <Layout>
                <AdminPage />
              </Layout>
            </RequireAdmin>
          </RequireProfileAndApproval>
        </RequireAuth>
      </Route>

      <Route path="/mera-sankalp">
        <RequireAuth>
          <RequireProfileAndApproval>
            <RequireAdmin>
              <Layout>
                <MeraSankalpPage />
              </Layout>
            </RequireAdmin>
          </RequireProfileAndApproval>
        </RequireAuth>
      </Route>

      <Route path="/payouts">
        <RequireAuth>
          <RequireProfileAndApproval>
            <RequireAdmin>
              <Layout>
                <AdminPayoutsPage />
              </Layout>
            </RequireAdmin>
          </RequireProfileAndApproval>
        </RequireAuth>
      </Route>

      <Route path="/niyam">
        <RequireAuth>
          <RequireProfileAndApproval>
            <Layout>
              <NiyamPage />
            </Layout>
          </RequireProfileAndApproval>
        </RequireAuth>
      </Route>

      <Route path="/contact">
        <RequireAuth>
          <RequireProfileAndApproval>
            <Layout>
              <ContactPage />
            </Layout>
          </RequireProfileAndApproval>
        </RequireAuth>
      </Route>

      <Route path="/forgot-password">
        <ForgotPasswordPage />
      </Route>

      <Route path="/reset-password">
        <ResetPasswordPage />
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="light" storageKey="naam-jaap-theme">
        <LanguageProvider>
          <AuthProvider>
            <TooltipProvider>
              <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
                <Router />
              </WouterRouter>
              <Toaster />
            </TooltipProvider>
          </AuthProvider>
        </LanguageProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
