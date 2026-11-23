import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api, errorMessage, fetchBlobUrl } from '../../lib/api';
import { DOCUMENT_TYPES } from '../../lib/constants';
import { date, fileSize } from '../../lib/format';
import { useInvalidateApplication } from '../../hooks/queries';
import { Alert, Badge, Button, Modal, Spinner } from '../ui';

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp';

/** Preview a protected document (fetched with the auth header, shown from a blob URL). */
export function DocumentPreview({ doc, onClose }) {
  const [url, setUrl] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!doc) return undefined;
    let href;
    setUrl(null);
    setError('');
    fetchBlobUrl(`/documents/${doc.id}/file`)
      .then((u) => {
        href = u;
        setUrl(u);
      })
      .catch((e) => setError(errorMessage(e, 'Could not load document')));
    return () => href && URL.revokeObjectURL(href);
  }, [doc]);

  if (!doc) return null;
  return (
    <Modal open onClose={onClose} title={doc.originalName} wide>
      {error ? (
        <Alert>{error}</Alert>
      ) : !url ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-8 w-8 text-brand-600" />
        </div>
      ) : doc.mimeType === 'application/pdf' ? (
        <iframe src={url} title={doc.originalName} className="h-[70vh] w-full rounded border" />
      ) : (
        <img src={url} alt={doc.originalName} className="mx-auto max-h-[70vh] rounded" />
      )}
      {url && (
        <div className="mt-3 text-right">
          <a href={url} download={doc.originalName} className="text-sm font-medium text-brand-600 hover:underline">
            Download
          </a>
        </div>
      )}
    </Modal>
  );
}

export function DocumentList({ documents = [], canDelete, onDeleted }) {
  const [preview, setPreview] = useState(null);
  const remove = useMutation({
    mutationFn: (id) => api.delete(`/documents/${id}`),
    onSuccess: onDeleted,
  });

  if (!documents.length) return <p className="text-sm text-slate-500">No documents uploaded yet.</p>;

  return (
    <>
      {remove.error && <Alert>{errorMessage(remove.error)}</Alert>}
      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
        {documents.map((d) => (
          <li key={d.id} className="flex items-center gap-3 px-3 py-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-slate-100 text-[10px] font-bold text-slate-500">
              {d.mimeType === 'application/pdf' ? 'PDF' : 'IMG'}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-800">{d.originalName}</p>
              <p className="text-xs text-slate-500">
                {fileSize(d.size)} · {date(d.createdAt)}
              </p>
            </div>
            <Badge tone={d.type === 'OTHER' ? 'slate' : 'blue'}>{DOCUMENT_TYPES[d.type]}</Badge>
            <Button variant="ghost" size="sm" onClick={() => setPreview(d)}>
              View
            </Button>
            {canDelete && (
              <Button
                variant="ghost"
                size="sm"
                className="text-red-600"
                loading={remove.isPending && remove.variables === d.id}
                onClick={() => remove.mutate(d.id)}
              >
                Remove
              </Button>
            )}
          </li>
        ))}
      </ul>
      <DocumentPreview doc={preview} onClose={() => setPreview(null)} />
    </>
  );
}

export function DocumentUploader({ applicationId, types = ['ID_PROOF', 'INCOME_PROOF', 'OTHER'], defaultType }) {
  const invalidate = useInvalidateApplication();
  const inputRef = useRef(null);
  const [type, setType] = useState(defaultType ?? types[0]);
  const [clientError, setClientError] = useState('');
  const upload = useMutation({
    mutationFn: (file) => {
      const form = new FormData();
      form.append('type', type);
      form.append('file', file);
      return api.post(`/applications/${applicationId}/documents`, form);
    },
    onSuccess: () => invalidate(applicationId),
  });

  const onFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    setClientError('');
    if (!file) return;
    if (!ACCEPT.split(',').includes(file.type)) return setClientError('Only PDF, JPG, PNG or WEBP files are allowed');
    if (file.size > MAX_BYTES) return setClientError('File is larger than 5 MB');
    upload.mutate(file);
  };

  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/60 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <select className="input sm:w-56" value={type} onChange={(e) => setType(e.target.value)}>
          {types.map((t) => (
            <option key={t} value={t}>
              {DOCUMENT_TYPES[t]}
            </option>
          ))}
        </select>
        <input ref={inputRef} type="file" accept={ACCEPT} className="hidden" onChange={onFile} />
        <Button type="button" variant="secondary" loading={upload.isPending} onClick={() => inputRef.current?.click()}>
          Choose file & upload
        </Button>
        <span className="text-xs text-slate-500">PDF or image, max 5 MB</span>
      </div>
      {(clientError || upload.error) && (
        <p className="mt-2 text-sm text-red-600">{clientError || errorMessage(upload.error)}</p>
      )}
      {upload.isSuccess && !upload.isPending && <p className="mt-2 text-sm text-emerald-600">Uploaded.</p>}
    </div>
  );
}
