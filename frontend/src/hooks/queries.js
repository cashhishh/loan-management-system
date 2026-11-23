import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

const clean = (params) =>
  Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v !== undefined && v !== null));

export function useLoanProducts() {
  return useQuery({
    queryKey: ['loan-products'],
    queryFn: () => api.get('/loan-products').then((r) => r.data.data),
    staleTime: Infinity,
  });
}

export function useApplications(params) {
  return useQuery({
    queryKey: ['applications', params],
    queryFn: () => api.get('/applications', { params: clean(params) }).then((r) => r.data),
    placeholderData: keepPreviousData,
  });
}

export function useApplicationStats() {
  return useQuery({
    queryKey: ['applications', 'stats'],
    queryFn: () => api.get('/applications/stats').then((r) => r.data.data),
  });
}

export function useApplication(id) {
  return useQuery({
    queryKey: ['application', id],
    queryFn: () => api.get(`/applications/${id}`).then((r) => r.data.data),
    enabled: !!id,
  });
}

export function useSchedule(id, enabled) {
  return useQuery({
    queryKey: ['application', id, 'schedule'],
    queryFn: () => api.get(`/applications/${id}/schedule`).then((r) => r.data),
    enabled: !!id && enabled,
  });
}

/** Invalidate everything that depends on an application after a change. */
export function useInvalidateApplication() {
  const qc = useQueryClient();
  return (id) => {
    qc.invalidateQueries({ queryKey: ['application', id] });
    qc.invalidateQueries({ queryKey: ['applications'] });
  };
}

export function useApplicationAction(id) {
  const invalidate = useInvalidateApplication();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ action, note }) =>
      api.post(`/applications/${id}/actions`, { action, note }).then((r) => r.data.data),
    onSuccess: (data) => {
      qc.setQueryData(['application', id], data);
      invalidate(id);
    },
  });
}
