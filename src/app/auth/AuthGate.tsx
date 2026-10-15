import { useLiveQuery } from 'dexie-react-hooks';
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { db } from '@/data/db.ts';
import { currentSubscription } from '@/data/subscription.ts';

const AUTH_ROUTES = new Set(['/register', '/login']);
/** Pages anyone may open, signed in or not. */
const PUBLIC_ROUTES = new Set(['/welcome']);

/** Sends new visitors to the landing page, signed-out accounts to login and new learners (accounts or guests) to the gift and the short diagnostic. */
export function AuthGate({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  // `undefined` = still loading, `null` = no profile row yet.
  const profile = useLiveQuery(() => db.profile.get('me').then((p) => p ?? null), []);
  const account = profile === undefined ? undefined : (profile?.account ?? null);
  const session = useLiveQuery(() => db.meta.get('session').then((s) => s?.value ?? 0), []);
  if (account === undefined || session === undefined) return <div className="min-h-dvh" aria-busy="true" />;

  const onAuthRoute = AUTH_ROUTES.has(pathname);
  const onPublic = PUBLIC_ROUTES.has(pathname);
  const guest = Boolean(profile?.guest) && account === null;
  const identity = account !== null || guest;
  const signedIn = identity && session === 1;
  if (onPublic) return <>{children}</>;
  if (!identity && !onAuthRoute) return <Navigate to="/welcome" replace />;
  if (identity && !signedIn && !onAuthRoute) return <Navigate to="/login" replace />;
  // A guest may open the auth pages to create an account (keeping progress) or to sign in.
  if (signedIn && onAuthRoute && guest) return <>{children}</>;
  // Right after registration: the gift screen (first month on max), then the mandatory short diagnostic.
  const onGift = pathname === '/gift';
  const onStart = pathname.startsWith('/start');
  const needsGift = Boolean(profile) && !profile?.giftShownAt && currentSubscription(profile!).status === 'trial';
  const quickDone = Boolean(profile?.quickDiagnostic);
  const next = needsGift ? '/gift' : quickDone ? '/' : '/start';
  // Auth pages never navigate themselves: this gate moves a signed-in user on (one <Navigate>, so its effect always fires).
  if (signedIn && onAuthRoute) return <Navigate to={next} replace />;
  if (signedIn && needsGift && !onGift) return <Navigate to="/gift" replace />;
  if (signedIn && !needsGift && onGift) return <Navigate to={quickDone ? '/' : '/start'} replace />;
  if (signedIn && !quickDone && !onStart && !onGift) return <Navigate to="/start" replace />;
  return <>{children}</>;
}
