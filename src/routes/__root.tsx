import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  useNavigate,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect } from "react";

import appCss from "../styles.css?url";
import { Toaster } from "@/components/ui/sonner";
import { useSession } from "@/hooks/useSession";
import { setStatusBarStyle } from "@/lib/native";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      // interactive-widget=resizes-content: iOS 17.4+ Safari가 키보드 만큼 viewport 축소
      //   (Drawer/Sheet 등 bottom-anchored fixed 요소가 키보드 위로 올라타는 빈공간 문제 방지)
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content" },
      { title: "탄단지 버블" },
      { name: "description", content: "탄·단·지 균형 체크 5초 트래커" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  // Capacitor 네이티브 환경에서만 동작 — 흰 배경에 검정 상태바 텍스트.
  // 웹/SSR에선 native.ts가 no-op으로 처리.
  useEffect(() => {
    void setStatusBarStyle("dark");
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <AppShell />
      <Toaster />
    </QueryClientProvider>
  );
}

/**
 * 라우트 가드 + 레이아웃.
 *  - /auth/* : 인증 화면. BottomTabBar 숨김. 가드 X
 *  - 그 외   : 인증 필요. unauthenticated → /auth/login?next=<현재경로>
 */
function AppShell() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isAuthRoute = pathname.startsWith("/auth/");
  const { session, status } = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthRoute) return;
    if (status === "unauthenticated") {
      navigate({
        to: "/auth/login",
        search: pathname === "/" ? undefined : { next: pathname },
        replace: true,
      });
    }
  }, [isAuthRoute, status, pathname, navigate]);

  // auth 화면은 가드 통과
  if (isAuthRoute) {
    return (
      <div
        className="min-h-screen w-full bg-white"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <Outlet />
      </div>
    );
  }

  // 부팅/리다이렉트 중
  if (status === "loading" || status === "unauthenticated") {
    return <SplashScreen />;
  }

  if (status === "error") {
    return <AuthErrorScreen />;
  }

  // authenticated
  void session;
  return (
    <>
      {/*
        pt-[safe-area]: iOS 노치/다이내믹 아일랜드 영역 회피 (Capacitor WebView).
        pb-40(160px): BottomTabBar(~60px) + FAB(56pt at bottom+88) 모두 클리어 — 마지막 row의 ⋮ 액션 버튼 가림 방지.
      */}
      <div
        className="min-h-screen w-full bg-white pb-40"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <Outlet />
      </div>
      <BottomTabBar />
    </>
  );
}

function SplashScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-200 border-t-neutral-900" />
    </div>
  );
}

function AuthErrorScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-6">
      <div className="max-w-sm text-center">
        <h2 className="text-base font-semibold text-neutral-900">
          앱을 시작할 수 없어요
        </h2>
        <p className="mt-2 text-xs text-neutral-500">
          환경설정(SUPABASE_URL/ANON_KEY)을 확인해주세요. 잠시 후 다시 시도하면
          해결될 수 있어요.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="mt-5 inline-flex h-10 items-center rounded-lg bg-neutral-900 px-4 text-xs font-semibold text-white"
        >
          다시 시도
        </button>
      </div>
    </div>
  );
}

import { Home, Waves, Settings as SettingsIcon } from "lucide-react";

const TABS = [
  { to: "/", icon: Home, label: "홈" },
  { to: "/history", icon: Waves, label: "기록" },
  { to: "/settings", icon: SettingsIcon, label: "설정" },
] as const;

function BottomTabBar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(env(safe-area-inset-bottom),16px)] pointer-events-none">
      <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-neutral-200/70 bg-white/90 p-1.5 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.18)] backdrop-blur-xl">
        {TABS.map((tab) => {
          const active =
            tab.to === "/"
              ? pathname === "/"
              : pathname === tab.to || pathname.startsWith(`${tab.to}/`);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.to}
              to={tab.to}
              className={`flex flex-col items-center justify-center gap-1 rounded-full px-5 py-2 transition-all duration-200 ${
                active
                  ? "bg-neutral-900 text-white shadow-sm"
                  : "text-neutral-400 hover:text-neutral-700"
              }`}
            >
              <Icon className="h-[20px] w-[20px]" strokeWidth={2.2} />
              <span className="text-[10px] font-semibold leading-none">
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
