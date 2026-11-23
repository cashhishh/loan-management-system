import { useEffect, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import clsx from 'clsx';
import { useAuth } from '../../context/AuthContext';
import { api, errorMessage } from '../../lib/api';
import { ROLE_LABEL } from '../../lib/constants';
import { date } from '../../lib/format';
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Field,
  Modal,
  PageHeader,
  PageLoader,
  Pagination,
} from '../../components/ui';

const createSchema = z.object({
  name: z.string().trim().min(2, 'Name is too short'),
  email: z.string().trim().email('Enter a valid email'),
  password: z
    .string()
    .min(8, 'At least 8 characters')
    .regex(/[A-Za-z]/, 'Needs a letter')
    .regex(/[0-9]/, 'Needs a number'),
  role: z.enum(['APPLICANT', 'OFFICER', 'ADMIN']),
});

const ROLE_TONE = { ADMIN: 'indigo', OFFICER: 'teal', APPLICANT: 'slate' };

export default function UsersPage() {
  const { user: me } = useAuth();
  const qc = useQueryClient();
  const [params, setParams] = useState({ page: 1, limit: 10, role: '', q: '' });
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setParams((p) => (p.q === search ? p : { ...p, q: search, page: 1 })), 350);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['users', params],
    queryFn: () =>
      api
        .get('/users', { params: Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '')) })
        .then((r) => r.data),
    placeholderData: keepPreviousData,
  });

  const update = useMutation({
    mutationFn: ({ id, ...body }) => api.patch(`/users/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });

  return (
    <div>
      <PageHeader
        title="Users"
        subtitle="Manage applicants, loan officers and admins."
        actions={<Button onClick={() => setCreating(true)}>+ Add user</Button>}
      />
      <div className="card">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row">
          <input
            className="input sm:max-w-xs"
            placeholder="Search name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="input sm:w-48"
            value={params.role}
            onChange={(e) => setParams((p) => ({ ...p, role: e.target.value, page: 1 }))}
          >
            <option value="">All roles</option>
            {Object.entries(ROLE_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        {update.error && (
          <div className="p-4">
            <Alert>{errorMessage(update.error)}</Alert>
          </div>
        )}
        {isLoading ? (
          <PageLoader />
        ) : error ? (
          <div className="p-4">
            <ErrorState message={errorMessage(error)} onRetry={refetch} />
          </div>
        ) : !data.data.length ? (
          <EmptyState title="No users found" />
        ) : (
          <div className="overflow-x-auto">
            <table className="table w-full min-w-[720px]">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Applications</th>
                  <th>Joined</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.data.map((u) => {
                  const self = u.id === me.id;
                  return (
                    <tr key={u.id} className={clsx(!u.isActive && 'opacity-60')}>
                      <td>
                        <div className="font-medium">
                          {u.name} {self && <span className="text-xs text-slate-400">(you)</span>}
                        </div>
                        <div className="text-xs text-slate-500">{u.email}</div>
                      </td>
                      <td>
                        <select
                          aria-label={`Role of ${u.name}`}
                          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm disabled:bg-slate-100"
                          value={u.role}
                          disabled={self || update.isPending}
                          onChange={(e) => update.mutate({ id: u.id, role: e.target.value })}
                        >
                          {Object.entries(ROLE_LABEL).map(([v, l]) => (
                            <option key={v} value={v}>
                              {l}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>{u.applicationCount}</td>
                      <td>{date(u.createdAt)}</td>
                      <td>
                        <Badge tone={u.isActive ? 'green' : 'red'}>{u.isActive ? 'Active' : 'Disabled'}</Badge>{' '}
                        <Badge tone={ROLE_TONE[u.role]}>{ROLE_LABEL[u.role]}</Badge>
                      </td>
                      <td className="text-right">
                        {!self && (
                          <Button
                            size="sm"
                            variant={u.isActive ? 'secondary' : 'success'}
                            onClick={() => update.mutate({ id: u.id, isActive: !u.isActive })}
                          >
                            {u.isActive ? 'Disable' : 'Enable'}
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {data && <Pagination meta={data.meta} onPage={(page) => setParams((p) => ({ ...p, page }))} />}
      </div>
      <CreateUserModal open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

function CreateUserModal({ open, onClose }) {
  const qc = useQueryClient();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({ resolver: zodResolver(createSchema), defaultValues: { role: 'OFFICER' } });
  const create = useMutation({
    mutationFn: (body) => api.post('/users', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      reset();
      onClose();
    },
  });

  return (
    <Modal open={open} onClose={onClose} title="Add user">
      <form onSubmit={handleSubmit((v) => create.mutate(v))} className="space-y-4" noValidate>
        {create.error && <Alert>{errorMessage(create.error)}</Alert>}
        <Field label="Name" error={errors.name?.message}>
          <input className="input" {...register('name')} />
        </Field>
        <Field label="Email" error={errors.email?.message}>
          <input className="input" type="email" {...register('email')} />
        </Field>
        <Field label="Temporary password" error={errors.password?.message}>
          <input className="input" type="password" autoComplete="new-password" {...register('password')} />
        </Field>
        <Field label="Role" error={errors.role?.message}>
          <select className="input" {...register('role')}>
            {Object.entries(ROLE_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={create.isPending}>
            Create user
          </Button>
        </div>
      </form>
    </Modal>
  );
}
