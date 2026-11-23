import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import clsx from 'clsx';
import { homeFor, useAuth } from '../context/AuthContext';
import { errorMessage } from '../lib/api';
import { Alert, Button, Field } from '../components/ui';

const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});

const registerSchema = z
  .object({
    name: z.string().trim().min(2, 'Name is too short'),
    email: z.string().trim().email('Enter a valid email'),
    password: z
      .string()
      .min(8, 'At least 8 characters')
      .regex(/[A-Za-z]/, 'Must contain a letter')
      .regex(/[0-9]/, 'Must contain a number'),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' });

const DEMO = [
  { role: 'Applicant', email: 'applicant@lms.test', password: 'Applicant@1234' },
  { role: 'Loan Officer', email: 'officer@lms.test', password: 'Officer@1234' },
  { role: 'Admin', email: 'admin@lms.test', password: 'Admin@1234' },
];

function AuthShell({ title, subtitle, children }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-gradient-to-br from-brand-700 to-indigo-900 p-12 text-white lg:flex">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <img src="/favicon.svg" alt="" className="h-8 w-8 rounded-lg ring-2 ring-white/30" /> LoanDesk
        </div>
        <div>
          <h2 className="text-3xl font-semibold leading-tight">From application to EMI schedule, in one workflow.</h2>
          <p className="mt-4 max-w-md text-brand-100">
            Applicants apply and track status, loan officers review with rule-based eligibility checks, and admins give
            the final decision — every step on an audit trail.
          </p>
        </div>
        <p className="text-sm text-brand-100/70">Loan Management System · demo build</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
          <p className="mb-6 mt-1 text-sm text-slate-500">{subtitle}</p>
          {children}
        </div>
      </div>
    </div>
  );
}

export function LoginPage() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState('');
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(loginSchema) });

  if (user) return <Navigate to={homeFor(user.role)} replace />;

  const onSubmit = async (values) => {
    setError('');
    try {
      const u = await login(values);
      navigate(location.state?.from?.pathname || homeFor(u.role), { replace: true });
    } catch (e) {
      setError(errorMessage(e, 'Login failed'));
    }
  };

  return (
    <AuthShell title="Welcome back" subtitle="Log in to manage your loans.">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {error && <Alert>{error}</Alert>}
        <Field label="Email" error={errors.email?.message}>
          <input
            className={clsx('input', errors.email && 'input-error')}
            type="email"
            autoComplete="email"
            {...register('email')}
          />
        </Field>
        <Field label="Password" error={errors.password?.message}>
          <input
            className={clsx('input', errors.password && 'input-error')}
            type="password"
            autoComplete="current-password"
            {...register('password')}
          />
        </Field>
        <Button type="submit" className="w-full" loading={isSubmitting}>
          Log in
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-slate-600">
        New here?{' '}
        <Link to="/register" className="font-medium text-brand-600 hover:underline">
          Create an applicant account
        </Link>
      </p>
      <div className="mt-8 rounded-lg border border-dashed border-slate-300 p-3">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Demo accounts</p>
        <div className="grid grid-cols-3 gap-2">
          {DEMO.map((d) => (
            <button
              key={d.email}
              type="button"
              onClick={() => {
                setValue('email', d.email);
                setValue('password', d.password);
              }}
              className="rounded-md border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-700 hover:border-brand-500 hover:text-brand-700"
            >
              {d.role}
            </button>
          ))}
        </div>
      </div>
    </AuthShell>
  );
}

export function RegisterPage() {
  const { register: signUp, user } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(registerSchema) });

  if (user) return <Navigate to={homeFor(user.role)} replace />;

  const onSubmit = async ({ name, email, password }) => {
    setError('');
    try {
      await signUp({ name, email, password });
      navigate('/dashboard', { replace: true });
    } catch (e) {
      setError(errorMessage(e, 'Sign up failed'));
    }
  };

  const input = (name, type = 'text', autoComplete) => (
    <input
      className={clsx('input', errors[name] && 'input-error')}
      type={type}
      autoComplete={autoComplete}
      {...register(name)}
    />
  );

  return (
    <AuthShell title="Create your account" subtitle="Apply for a loan in a few minutes.">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {error && <Alert>{error}</Alert>}
        <Field label="Full name" error={errors.name?.message}>
          {input('name', 'text', 'name')}
        </Field>
        <Field label="Email" error={errors.email?.message}>
          {input('email', 'email', 'email')}
        </Field>
        <Field label="Password" error={errors.password?.message} hint="8+ characters with a letter and a number">
          {input('password', 'password', 'new-password')}
        </Field>
        <Field label="Confirm password" error={errors.confirm?.message}>
          {input('confirm', 'password', 'new-password')}
        </Field>
        <Button type="submit" className="w-full" loading={isSubmitting}>
          Create account
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-slate-600">
        Already registered?{' '}
        <Link to="/login" className="font-medium text-brand-600 hover:underline">
          Log in
        </Link>
      </p>
    </AuthShell>
  );
}
