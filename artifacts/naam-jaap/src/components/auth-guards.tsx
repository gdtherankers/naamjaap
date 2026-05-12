import { useAuth } from "@workspace/replit-auth-web";
import { useGetMyProfile, useGetJaapSnapshot } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/hooks/use-toast";


export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, kickedOut } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    if (kickedOut) {
      toast({
        title: "दूसरे डिवाइस पर लॉगिन",
        description: "आपका अकाउंट किसी दूसरे डिवाइस पर लॉगिन हो गया है। यहाँ से लॉगआउट हो गया।",
        variant: "destructive",
        duration: 6000,
      });
      setTimeout(() => setLocation("/"), 500);
      return;
    }
    if (!isLoading && !isAuthenticated) {
      setLocation("/");
    }
  }, [isLoading, isAuthenticated, kickedOut, setLocation, toast]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex h-[100dvh] w-full items-center justify-center">
        <Spinner className="h-8 w-8 text-primary" />
      </div>
    );
  }

  return <>{children}</>;
}

export function RequireProfileAndApproval({ children }: { children: React.ReactNode }) {
  const { data: profileEnv, isLoading: isProfileLoading } = useGetMyProfile();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isProfileLoading) {
      if (!profileEnv?.profile) {
        setLocation("/onboarding");
      } else if (!profileEnv.profile.approved) {
        setLocation("/pending");
      }
    }
  }, [isProfileLoading, profileEnv, setLocation]);

  if (isProfileLoading || !profileEnv?.profile || !profileEnv.profile.approved) {
    return (
      <div className="flex h-[100dvh] w-full items-center justify-center">
        <Spinner className="h-8 w-8 text-primary" />
      </div>
    );
  }

  return <>{children}</>;
}

export function RequireSankalp({ children }: { children: React.ReactNode }) {
  const { data: profileEnv, isLoading: isProfileLoading } = useGetMyProfile();
  const [location, setLocation] = useLocation();

  const isAdmin = profileEnv?.profile?.isAdmin;

  useEffect(() => {
    if (isProfileLoading) return;
    // Admins don't do jaap — redirect them away from /jaap to dashboard
    if (isAdmin && location === "/jaap") {
      setLocation("/dashboard");
    }
  }, [isProfileLoading, isAdmin, location, setLocation]);

  if (isProfileLoading) {
    return (
      <div className="flex h-[100dvh] w-full items-center justify-center">
        <Spinner className="h-8 w-8 text-primary" />
      </div>
    );
  }

  return <>{children}</>;
}

export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { data: profileEnv, isLoading: isProfileLoading } = useGetMyProfile();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isProfileLoading && !profileEnv?.profile?.isAdmin) {
      setLocation("/dashboard");
    }
  }, [isProfileLoading, profileEnv, setLocation]);

  if (isProfileLoading || !profileEnv?.profile?.isAdmin) {
    return (
      <div className="flex h-[100dvh] w-full items-center justify-center">
        <Spinner className="h-8 w-8 text-primary" />
      </div>
    );
  }

  return <>{children}</>;
}
