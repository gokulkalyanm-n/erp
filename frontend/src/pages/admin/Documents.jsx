import { useEffect, useRef, useState } from 'react';
import {
  getAdminDocuments, getAdminSharedDocs, uploadAdminDoc,
  deleteDocument, getEmployees
} from '../../services/api';
import PageHeader from '../../components/PageHeader';
import LoadingSpinner from '../../components/LoadingSpinner';
import DocCard, { fmtSize } from '../../components/DocCard';
import { formatApplied } from '../../utils/helpers';
import toast from 'react-hot-toast';
import { Search, Upload, X, Users, Globe } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Navigate } from 'react-router-dom';

const ADMIN_CATEGORIES = ['Policy', 'Handbook', 'Offer Letter', 'Other'];
const ALLOWED_EXT      = '.pdf,.jpg,.jpeg,.png,.doc,.docx';
const MAX_MB           = 5;

const EMP_CATEGORIES_ALL = ['ID Proof', 'Certificate', 'Offer Letter', 'Other',
  'Policy', 'Handbook'];

export default function AdminDocuments() {
  const { hasPermission, isSuperAdmin } = useAuth();
  const canView   = hasPermission('DOCUMENTS_VIEW')   || isSuperAdmin;
  const canManage = hasPermission('DOCUMENTS_MANAGE') || isSuperAdmin;

  if (!canView) return <Navigate to="/admin" replace />;

  const [tab, setTab] = useState('employee');

  // ── Employee docs tab state ──
  const [empDocs, setEmpDocs]         = useState([]);
  const [employees, setEmployees]     = useState([]);
  const [loadingEmp, setLoadingEmp]   = useState(true);
  const [search, setSearch]           = useState('');
  const [filterEmp, setFilterEmp]     = useState('');
  const [filterCat, setFilterCat]     = useState('');
  const [filterStart, setFilterStart] = useState('');
  const [filterEnd, setFilterEnd]     = useState('');

  // ── Shared docs tab state ──
  const [sharedDocs, setSharedDocs]     = useState([]);
  const [loadingShared, setLoadingShared] = useState(true);
  const [uploading, setUploading]       = useState(false);

  // Upload form
  const [title, setTitle]           = useState('');
  const [category, setCategory]     = useState(ADMIN_CATEGORIES[0]);
  const [note, setNote]             = useState('');
  const [audience, setAudience]     = useState('all');
  const [empSearch, setEmpSearch]   = useState('');
  const [selectedEmps, setSelected] = useState([]);
  const [file, setFile]             = useState(null);
  const fileRef = useRef();

  const loadEmpDocs = async () => {
    setLoadingEmp(true);
    try {
      const params = {};
      if (filterEmp)   params.employeeId = filterEmp;
      if (filterCat)   params.category   = filterCat;
      if (search)      params.search     = search;
      if (filterStart) params.startDate  = filterStart;
      if (filterEnd)   params.endDate    = filterEnd;
      const [dRes, eRes] = await Promise.all([
        getAdminDocuments(params),
        getEmployees({ isActive: 'true' })
      ]);
      setEmpDocs(dRes.data);
      setEmployees(eRes.data);
    } catch { toast.error('Failed to load'); }
    finally { setLoadingEmp(false); }
  };

  const loadShared = async () => {
    setLoadingShared(true);
    try {
      const res = await getAdminSharedDocs();
      setSharedDocs(res.data);
    } catch { toast.error('Failed to load shared docs'); }
    finally { setLoadingShared(false); }
  };

  useEffect(() => { loadEmpDocs(); }, [filterEmp, filterCat, filterStart, filterEnd, search]);
  useEffect(() => { loadShared(); }, []);

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

  const toggleEmp = (id) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file) return toast.error('Please select a file');
    if (audience === 'selected' && selectedEmps.length === 0)
      return toast.error('Select at least one employee');
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('title', title.trim());
      fd.append('category', category);
      fd.append('note', note.trim());
      fd.append('audience', audience);
      if (audience === 'selected') fd.append('audienceUsers', JSON.stringify(selectedEmps));
      await uploadAdminDoc(fd);
      toast.success('Document shared successfully');
      setTitle(''); setCategory(ADMIN_CATEGORIES[0]); setNote('');
      setAudience('all'); setSelected([]); setEmpSearch(''); setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      loadShared();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Upload failed');
    } finally { setUploading(false); }
  };

  const handleDelete = async (doc) => {
    if (!canManage) return toast.error('No permission to delete');
    if (!window.confirm(`Delete "${doc.title}"?`)) return;
    try {
      await deleteDocument(doc._id);
      toast.success('Deleted');
      if (doc.ownerEmployee) loadEmpDocs(); else loadShared();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
  };

  const filteredEmps = employees.filter(e =>
    !empSearch ||
    e.name.toLowerCase().includes(empSearch.toLowerCase()) ||
    e.employeeId?.toLowerCase().includes(empSearch.toLowerCase())
  );

  return (
    <div className="p-4 lg:p-8">
      <PageHeader title="Documents" subtitle="Employee and company documents" />

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg w-full sm:w-fit overflow-x-auto">
        <button onClick={() => setTab('employee')}
          className={`flex-1 sm:flex-none px-3 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${tab === 'employee' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
          Employee Documents
        </button>
        <button onClick={() => setTab('shared')}
          className={`flex-1 sm:flex-none px-3 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${tab === 'shared' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
          Shared Documents
        </button>
      </div>

      {/* ── EMPLOYEE DOCUMENTS TAB ── */}
      {tab === 'employee' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="card">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input className="input sm:col-span-2" placeholder="Search by title…"
                value={search} onChange={e => setSearch(e.target.value)} />
              <select className="input" value={filterEmp} onChange={e => setFilterEmp(e.target.value)}>
                <option value="">All Employees</option>
                {employees.map(e => <option key={e._id} value={e._id}>{e.name} ({e.employeeId})</option>)}
              </select>
              <select className="input" value={filterCat} onChange={e => setFilterCat(e.target.value)}>
                <option value="">All Categories</option>
                {EMP_CATEGORIES_ALL.map(c => <option key={c}>{c}</option>)}
              </select>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">From date</label>
                <input type="date" className="input" value={filterStart}
                  onChange={e => setFilterStart(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">To date</label>
                <input type="date" className="input" value={filterEnd}
                  onChange={e => setFilterEnd(e.target.value)} />
              </div>
            </div>
          </div>

          {loadingEmp ? <LoadingSpinner /> : empDocs.length === 0 ? (
            <div className="card text-center py-12 text-gray-400">No employee documents found.</div>
          ) : (
            <div className="space-y-3">
              {empDocs.map(d => (
                <DocCard key={d._id} doc={d} showOwner
                  onDelete={canManage ? handleDelete : undefined} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── SHARED DOCUMENTS TAB ── */}
      {tab === 'shared' && (
        <div className="space-y-4">
          {/* Upload form — only for admins with MANAGE */}
          {canManage && (
            <div className="card">
              <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <Upload className="w-4 h-4 text-blue-500" /> Share a Document
              </h3>
              <form onSubmit={handleUpload} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="label">Title *</label>
                    <input className="input" required placeholder="e.g. Employee Handbook 2026"
                      value={title} onChange={e => setTitle(e.target.value)} />
                  </div>
                  <div>
                    <label className="label">Category *</label>
                    <select className="input" value={category} onChange={e => setCategory(e.target.value)}>
                      {ADMIN_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="label">Note (optional)</label>
                  <input className="input" placeholder="Any additional info…"
                    value={note} onChange={e => setNote(e.target.value)} />
                </div>

                {/* Audience */}
                <div>
                  <label className="label">Share with</label>
                  <div className="flex gap-3">
                    <button type="button" onClick={() => setAudience('all')}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${audience === 'all' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'}`}>
                      <Globe className="w-4 h-4" /> All Employees
                    </button>
                    <button type="button" onClick={() => setAudience('selected')}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${audience === 'selected' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'}`}>
                      <Users className="w-4 h-4" /> Selected
                    </button>
                  </div>
                </div>

                {/* Employee multi-select */}
                {audience === 'selected' && (
                  <div>
                    <label className="label">Select Employees *</label>
                    {selectedEmps.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {selectedEmps.map(id => {
                          const e = employees.find(x => x._id === id);
                          return e ? (
                            <span key={id} className="inline-flex items-center gap-1 badge-blue text-xs">
                              {e.name}
                              <button type="button" onClick={() => toggleEmp(id)}>
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          ) : null;
                        })}
                      </div>
                    )}
                    <div className="relative mb-2">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                      <input className="input pl-9" placeholder="Search employees…"
                        value={empSearch} onChange={e => setEmpSearch(e.target.value)} />
                    </div>
                    <div className="border border-gray-200 rounded-xl max-h-44 overflow-y-auto">
                      {filteredEmps.map(e => (
                        <label key={e._id} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-50 last:border-0">
                          <input type="checkbox" className="rounded text-blue-600"
                            checked={selectedEmps.includes(e._id)}
                            onChange={() => toggleEmp(e._id)} />
                          <span className="text-sm text-gray-800">{e.name}</span>
                          <span className="text-xs text-gray-400 font-mono ml-auto">{e.employeeId}</span>
                        </label>
                      ))}
                      {filteredEmps.length === 0 && <p className="text-center text-gray-400 py-4 text-sm">No employees found</p>}
                    </div>
                  </div>
                )}

                <div>
                  <label className="label">File * (PDF, JPG, PNG, DOC, DOCX — max 5 MB)</label>
                  <input ref={fileRef} type="file" accept={ALLOWED_EXT}
                    onChange={handleFileChange}
                    className="block w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer" />
                  {file && <p className="text-xs text-gray-400 mt-1">{file.name} ({(file.size/1024/1024).toFixed(2)} MB)</p>}
                </div>

                <div className="flex justify-end">
                  <button type="submit" disabled={uploading || !file} className="btn-primary flex items-center gap-2">
                    <Upload className="w-4 h-4" />
                    {uploading ? 'Uploading…' : 'Share Document'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* List */}
          {loadingShared ? <LoadingSpinner /> : sharedDocs.length === 0 ? (
            <div className="card text-center py-12 text-gray-400">No shared documents yet.</div>
          ) : (
            <div className="space-y-3">
              {sharedDocs.map(d => (
                <DocCard key={d._id} doc={d} showAudience
                  onDelete={canManage ? handleDelete : undefined} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
