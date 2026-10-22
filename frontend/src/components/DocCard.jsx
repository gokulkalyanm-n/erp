import { Download, Trash2, FileText, Image, File } from 'lucide-react';
import { formatApplied } from '../utils/helpers';
import { downloadDoc } from '../utils/downloadDoc';
import toast from 'react-hot-toast';

/** Format bytes → human-readable */
export function fmtSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Icon based on mime type */
function FileIcon({ mimeType, className = 'w-5 h-5' }) {
  if (!mimeType) return <File className={className} />;
  if (mimeType === 'application/pdf')                        return <FileText className={`${className} text-red-500`} />;
  if (mimeType.startsWith('image/'))                        return <Image className={`${className} text-blue-500`} />;
  if (mimeType.includes('word') || mimeType.includes('doc')) return <FileText className={`${className} text-blue-700`} />;
  return <File className={className} />;
}

/**
 * DocCard — reusable card for one document.
 *
 * Props:
 *   doc          — document object (metadata only)
 *   onDelete     — optional function(doc) — if provided shows delete button
 *   showOwner    — show ownerEmployee name (admin view)
 *   showAudience — show who it was shared with
 */
export default function DocCard({ doc, onDelete, showOwner = false, showAudience = false }) {
  const handleDownload = async () => {
    try {
      await downloadDoc(doc._id, doc.fileName, doc.mimeType);
    } catch (err) {
      toast.error('Download failed. Please try again.');
    }
  };

  return (
    <div className="card hover:shadow-md transition-shadow">
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center flex-shrink-0">
          <FileIcon mimeType={doc.mimeType} />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 truncate">{doc.title}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            <span className="badge-blue text-xs mr-1">{doc.category}</span>
            {fmtSize(doc.fileSize)} · {doc.fileName}
          </p>
          {doc.note && <p className="text-xs text-gray-400 mt-1 line-clamp-1">{doc.note}</p>}

          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 text-xs text-gray-400">
            {showOwner && doc.ownerEmployee && (
              <span>By {doc.ownerEmployee.name} ({doc.ownerEmployee.employeeId})</span>
            )}
            {!showOwner && doc.uploadedBy && (
              <span>By {doc.uploadedBy.name}</span>
            )}
            <span>{formatApplied(doc.createdAt)}</span>
          </div>

          {showAudience && (
            <p className="text-xs text-gray-400 mt-0.5">
              {doc.audience === 'all'
                ? 'Shared with all employees'
                : `Shared with ${doc.audienceUsers?.length ?? 0} employee${doc.audienceUsers?.length !== 1 ? 's' : ''}`}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-1 flex-shrink-0">
          <button
            onClick={handleDownload}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-600 transition-colors"
            title="Download"
          >
            <Download className="w-4 h-4" />
          </button>
          {onDelete && (
            <button
              onClick={() => onDelete(doc)}
              className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
              title="Delete"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
