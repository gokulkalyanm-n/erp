import { useEffect, useRef, useState } from 'react';
import {
  getMyDocuments, getSharedDocuments, getCompanyDocuments,
  uploadEmployeeDoc, deleteDocument
} from '../../services/api';
import PageHeader from '../../components/PageHeader';
import LoadingSpinner from '../../components/LoadingSpinner';
import DocCard from '../../components/DocCard';
import toast from 'react-hot-toast';
import { Plus, Upload, FolderOpen } from 'lucide-react';

const EMP_CATEGORIES = ['ID Proof', 'Certificate', 'Offer Letter', 'Other'];
const ALLOWED_EXT    = '.pdf,.jpg,.jpeg,.png,.doc,.docx';
const MAX_MB         = 5;

function EmptyState({ message }) {
  return (
    <div className="card text-center py-14 text-gray-400">
      <FolderOpen className="w-10 h-10 mx-auto mb-3 opacity-25" />
      <p className="font-medium">{message}</p>
    </div>
  );
}

export default function MyDocuments() {
  const [tab, setTab]             = useState('uploads');
  const [myDocs, setMyDocs]       = useState([]);
  const [shared, setShared]       = useState([]);
  const [company, setCompany]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [uploading, setUploading] = useState(false);

  // Upload form state
  const [title, setTitle]       = useState('');
  const [category, setCategory] = useState(EMP_CATEGORIES[0]);
  const [note, setNote]         = useState('');
  const [file, setFile]         = useState(null);
  const fileRef = useRef();

  const load = async () => {
    setLoading(true);
    try {
      const [m, s, c] = await Promise.all([
        getMyDocuments(),
        getSharedDocuments(),
        getCompanyDocuments(),
      ]);
      setMyDocs(m.data);
      setShared(s.data);
      setCompany(c.data);
    } catch { toast.error('Failed to load documents'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > MAX_MB * 1024 * 1024) {
      toast.error(`File must be under ${MAX_MB} MB`);
      fileRef.current.value = '';
      return;
    }
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.[^/.]+$/, ''));
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file) return toast.error('Please select a file');
    if (!title.trim()) return toast.error('Title is required');
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('title', title.trim());
      fd.append('category', category);
      fd.append('note', note.trim());
      await uploadEmployeeDoc(fd);
      toast.success('Document uploaded');
      setTitle(''); setCategory(EMP_CATEGORIES[0]); setNote(''); setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Upload failed');
    } finally { setUploading(false); }
  };

  const handleDelete = async (doc) => {
    if (!window.confirm(`Delete "${doc.title}"?`)) return;
    try {
      await deleteDocument(doc._id);
      toast.success('Document deleted');
      load();
    } catch (err) { toast.error(err.response?.data?.message || 'Delete failed'); }
  };

  const tabs = [
    { key: 'uploads', label: `My Uploads (${myDocs.length})` },
    { key: 'shared',  label: `Shared With Me (${shared.length})` },
    { key: 'company', label: `Company (${company.length})` },
  ];

  return (
    <div className="p-4 lg:p-8">
      <PageHeader title="My Documents" subtitle="Upload, view and download your documents" />

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg w-full overflow-x-auto">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-1 sm:flex-none px-3 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
              tab === t.key ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? <LoadingSpinner /> : (
        <>
          {/* ── MY UPLOADS ── */}
          {tab === 'uploads' && (
            <div className="space-y-4">
              {/* Upload form */}
              <div className="card">
                <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                  <Upload className="w-4 h-4 text-blue-500" /> Upload a Document
                </h3>
                <form onSubmit={handleUpload} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="label">Title *</label>
                      <input className="input" required placeholder="e.g. Aadhaar Card"
                        value={title} onChange={e => setTitle(e.target.value)} />
                    </div>
                    <div>
                      <label className="label">Category *</label>
                      <select className="input" value={category} onChange={e => setCategory(e.target.value)}>
                        {EMP_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="label">Note (optional)</label>
                    <input className="input" placeholder="Any additional info…"
                      value={note} onChange={e => setNote(e.target.value)} />
                  </div>
                  <div>
                    <label className="label">File * (PDF, JPG, PNG, DOC, DOCX — max 5 MB)</label>
                    <input ref={fileRef} type="file" accept={ALLOWED_EXT}
                      onChange={handleFileChange}
                      className="block w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer" />
                    {file && <p className="text-xs text-gray-400 mt-1">{file.name} ({(file.size/1024/1024).toFixed(2)} MB)</p>}
                  </div>
                  <div className="flex justify-end">
                    <button type="submit" disabled={uploading || !file} className="btn-primary flex items-center gap-2">
                      <Plus className="w-4 h-4" />
                      {uploading ? 'Uploading…' : 'Upload'}
                    </button>
                  </div>
                </form>
              </div>

              {myDocs.length === 0
                ? <EmptyState message="No documents uploaded yet." />
                : myDocs.map(d => (
                    <DocCard key={d._id} doc={d} onDelete={handleDelete} />
                  ))
              }
            </div>
          )}

          {/* ── SHARED WITH ME ── */}
          {tab === 'shared' && (
            <div className="space-y-3">
              {shared.length === 0
                ? <EmptyState message="No documents have been shared with you yet." />
                : shared.map(d => <DocCard key={d._id} doc={d} />)
              }
            </div>
          )}

          {/* ── COMPANY DOCUMENTS ── */}
          {tab === 'company' && (
            <div className="space-y-3">
              {company.length === 0
                ? <EmptyState message="No company-wide documents yet." />
                : company.map(d => <DocCard key={d._id} doc={d} />)
              }
            </div>
          )}
        </>
      )}
    </div>
  );
}
