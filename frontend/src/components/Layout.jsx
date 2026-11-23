import { useState } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import clsx from 'clsx';
import { homeFor, useAuth } from '../context/AuthContext';
import { ROLE_LABEL } from '../lib/constants';
import { PageLoader } from './ui';

const NAV = {
  APPLICANT: [
    { to: '/dashboard', label: 'My applications' },
    { to: '/applications/new', label: 'New application' },
  ],
  OFFICER: [{ to: '/review', label: 'Review queue' }],
  ADMIN: [
    { to: '/admin', label: 'Approvals', end: true },
    { to: '/admin/applications', label: 'All applications' },
    { to: '/admin/users', label: 'Users' },
  ],
};

export function ProtectedRoute({ roles }) {
  const { user, status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <PageLoader label="Restoring your session…" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  if (roles && !roles.includes(user.role)) return <Navigate to={homeFor(user.role)} replace />;
  return <Outlet />;
}

export default function Layout() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const links = NAV[user.role] ?? [];

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4 sm:px-6">
          <Link to={homeFor(user.role)} className="flex items-center gap-2 font-semibold text-slate-900">
            <img src="/favicon.svg" alt="" className="h-7 w-7" />
            LoanDesk
          </Link>
          <nav className="hidden gap-1 md:flex">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                className={({ isActive }) =>
                  clsx(
                    'rounded-md px-3 py-1.5 text-sm font-medium transition',
                    isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100',
                  )
                }
              >
                {l.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto hidden items-center gap-3 md:flex">
            <div className="text-right leading-tight">
              <div className="text-sm font-medium">{user.name}</div>
              <div className="text-xs text-slate-500">{ROLE_LABEL[user.role]}</div>
            </div>
            <button onClick={logout} className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100">
              Log out
            </button>
          </div>
          <button
            className="ml-auto rounded-md p-2 text-slate-600 hover:bg-slate-100 md:hidden"
            onClick={() => setOpen((o) => !o)}
            aria-label="Menu"
          >
            ☰
          </button>
        </div>
        {open && (
          <div className="border-t border-slate-200 px-4 py-3 md:hidden">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                onClick={() => setOpen(false)}
                className="block rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
              >
                {l.label}
              </NavLink>
            ))}
            <div className="mt-2 flex items-center justify-between border-t border-slate-100 px-3 pt-3 text-sm">
              <span>
                {user.name} · {ROLE_LABEL[user.role]}
              </span>
              <button onClick={logout} className="text-brand-600">
                Log out
              </button>
            </div>
          </div>
        )}
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        <Outlet />
      </main>
    </div>
  );
}
