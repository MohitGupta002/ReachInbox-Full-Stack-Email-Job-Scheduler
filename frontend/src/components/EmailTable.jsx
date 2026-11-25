import React, { useState, useEffect, useRef } from 'react';
import api from '../services/api';
import {
  Search,
  RefreshCw,
  Plus,
  ExternalLink,
  Clock,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Mail,
  Inbox,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function EmailTable({ onOpenCompose, refreshTrigger, stats }) {
  const [activeTab, setActiveTab] = useState('scheduled'); // 'scheduled' | 'sent'
  const [emails, setEmails] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [retryingId, setRetryingId] = useState(null);
  const prevTriggerRef = useRef(refreshTrigger);

  // Debounced Search or regular tab/page load (300ms)
  useEffect(() => {
    const isSilentRefresh = prevTriggerRef.current !== refreshTrigger;
    prevTriggerRef.current = refreshTrigger;

    const handler = setTimeout(() => {
      fetchEmails({ silent: isSilentRefresh });
    }, isSilentRefresh ? 50 : 300);

    return () => clearTimeout(handler);
  }, [activeTab, searchQuery, statusFilter, page, refreshTrigger]);

  const fetchEmails = async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);

      if (searchQuery.trim() || statusFilter) {
        const res = await api.get('/emails/search', {
          params: {
            q: searchQuery.trim(),
            status: statusFilter || undefined,
            page,
            limit: 20,
          },
        });
        setEmails(res.data.emails || []);
        setTotalCount(res.data.total || 0);
        setTotalPages(res.data.totalPages || 1);
      } else {
        const endpoint = activeTab === 'scheduled' ? '/emails/scheduled' : '/emails/sent';
        const res = await api.get(endpoint, {
          params: { page, limit: 20 },
        });
        setEmails(res.data.emails || []);
        setTotalCount(res.data.total || 0);
        setTotalPages(res.data.totalPages || 1);
      }
    } catch (err) {
      console.error('Error fetching emails:', err);
      toast.error('Could not load email records');
    } finally {
      setLoading(false);
    }
  };

  const handleRetryJob = async (jobId) => {
    try {
      setRetryingId(jobId);
      await api.post(`/emails/${jobId}/retry`);
      toast.success('Email re-queued for immediate delivery');
      fetchEmails({ silent: true });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to retry job');
    } finally {
      setRetryingId(null);
    }
  };

  const getStatusBadge = (email) => {
    switch (email.status) {
      case 'SCHEDULED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200/80">
            <Clock className="w-3.5 h-3.5 text-blue-500" />
            <span>Scheduled</span>
          </span>
        );
      case 'DELAYED_RATE_LIMIT':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200/80">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
            <span>Rate Limited (Rescheduled)</span>
          </span>
        );
      case 'SENT':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            <span>Sent</span>
          </span>
        );
      case 'FAILED':
        return (
          <span
            title={email.error_message || 'Delivery failed'}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200/80"
          >
            <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
            <span>Failed</span>
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
            {email.status}
          </span>
        );
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      return d.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch (e) {
      return dateStr;
    }
  };

  return (
    <div className="bg-white rounded-3xl p-7 border border-slate-100 shadow-sm">
      {/* Top Controls: Tabs + Search Bar + Status Filter + Compose Button */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 mb-6">
        {/* Tab Switcher */}
        <div className="flex p-1 bg-slate-100/80 rounded-2xl shrink-0">
          <button
            onClick={() => {
              setActiveTab('scheduled');
              setSearchQuery('');
              setStatusFilter('');
              setPage(1);
            }}
            className={`px-5 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'scheduled' && !statusFilter
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Scheduled Queue ({stats?.totalActive ?? 0})
          </button>
          <button
            onClick={() => {
              setActiveTab('sent');
              setSearchQuery('');
              setStatusFilter('');
              setPage(1);
            }}
            className={`px-5 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'sent' && !statusFilter
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Sent History ({(stats?.sent ?? 0) + (stats?.failed ?? 0)})
          </button>
        </div>

        {/* Debounced Elasticsearch Search Bar + Status Filter */}
        <div className="flex flex-1 gap-2 max-w-xl">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search email, subject, or content..."
              className="w-full pl-10 pr-20 py-2 rounded-2xl border border-slate-200 text-xs font-medium text-slate-700 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-colors"
            />
            {searchQuery && (
              <span className="absolute right-3 top-2 text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-md">
                ES Search
              </span>
            )}
          </div>

          <select
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 rounded-2xl border border-slate-200 text-xs font-semibold text-slate-600 bg-white focus:outline-none focus:border-blue-500"
          >
            <option value="">All Statuses</option>
            <option value="SCHEDULED">Scheduled</option>
            <option value="DELAYED_RATE_LIMIT">Rate Limited</option>
            <option value="SENT">Sent</option>
            <option value="FAILED">Failed</option>
          </select>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={fetchEmails}
            title="Refresh"
            className="w-9 h-9 rounded-2xl border border-slate-200 hover:bg-slate-50 flex items-center justify-center text-slate-600 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-600' : ''}`} />
          </button>

          <button
            onClick={onOpenCompose}
            className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-600/25 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Compose New Email</span>
          </button>
        </div>
      </div>

      {/* Email Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              <th className="pb-3 px-3">Recipient</th>
              <th className="pb-3 px-3">Subject</th>
              <th className="pb-3 px-3">
                {activeTab === 'scheduled' ? 'Scheduled Timestamp' : 'Timestamp'}
              </th>
              <th className="pb-3 px-3">Status</th>
              <th className="pb-3 px-3 text-right">Preview / Delivery</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-50 text-xs">
            {loading ? (
              Array.from({ length: 5 }).map((_, idx) => (
                <tr key={idx} className="animate-pulse">
                  <td className="py-4 px-3"><div className="h-4 bg-slate-100 rounded-md w-36"></div></td>
                  <td className="py-4 px-3"><div className="h-4 bg-slate-100 rounded-md w-48"></div></td>
                  <td className="py-4 px-3"><div className="h-4 bg-slate-100 rounded-md w-28"></div></td>
                  <td className="py-4 px-3"><div className="h-6 bg-slate-100 rounded-full w-24"></div></td>
                  <td className="py-4 px-3 text-right"><div className="h-4 bg-slate-100 rounded-md w-16 ml-auto"></div></td>
                </tr>
              ))
            ) : emails.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-16 text-center">
                  <div className="flex flex-col items-center justify-center">
                    <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-300 mb-3 border border-slate-100">
                      <Inbox className="w-7 h-7" />
                    </div>
                    <h4 className="text-sm font-bold text-slate-700">No email jobs found</h4>
                    <p className="text-xs text-slate-400 mt-1 max-w-sm">
                      {searchQuery || statusFilter
                        ? `No results matching current filter. Try clearing the search or status filter.`
                        : activeTab === 'scheduled'
                        ? 'There are currently no delayed jobs in the queue. Click Compose to schedule a campaign.'
                        : 'No sent email history yet. Scheduled emails will appear here once dispatched.'}
                    </p>
                    {!searchQuery && !statusFilter && (
                      <button
                        onClick={onOpenCompose}
                        className="mt-4 px-4 py-2 rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-100 font-semibold text-xs transition-colors"
                      >
                        Schedule First Campaign
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              emails.map((email) => (
                <tr key={email.id} className="hover:bg-slate-50/60 transition-colors group">
                  <td className="py-3.5 px-3 font-semibold text-slate-800">
                    <div className="flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-500 transition-colors shrink-0" />
                      <div>
                        <span className="truncate max-w-[200px] block">{email.recipient_email}</span>
                        {email.sender?.email && (
                          <span className="text-[10px] font-normal text-slate-400 block truncate max-w-[200px]">
                            via {email.sender.email}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>

                  <td className="py-3.5 px-3 text-slate-600">
                    <span className="truncate max-w-[260px] block font-medium">{email.subject}</span>
                    {email.status === 'FAILED' && email.error_message && (
                      <span className="text-[11px] text-rose-500 block truncate max-w-[260px]">
                        {email.error_message}
                      </span>
                    )}
                  </td>

                  <td className="py-3.5 px-3 text-slate-500 whitespace-nowrap">
                    {formatDate(email.sent_at || email.scheduled_at)}
                  </td>

                  <td className="py-3.5 px-3">{getStatusBadge(email)}</td>

                  {/* Preview / Delivery / Retry */}
                  <td className="py-3.5 px-3 text-right">
                    {email.ethereal_preview_url ? (
                      <a
                        href={email.ethereal_preview_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold text-xs border border-indigo-200/80 transition-colors"
                      >
                        <span>Inspect Email</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : email.status === 'SENT' ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-emerald-50 text-emerald-700 text-[11px] font-semibold border border-emerald-200/80">
                        Gmail / SMTP Sent
                      </span>
                    ) : email.status === 'FAILED' ? (
                      <button
                        onClick={() => handleRetryJob(email.id)}
                        disabled={retryingId === email.id}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold text-xs border border-rose-200/80 transition-colors"
                      >
                        <RotateCcw className={`w-3 h-3 ${retryingId === email.id ? 'animate-spin' : ''}`} />
                        <span>{retryingId === email.id ? 'Retrying...' : 'Retry Send'}</span>
                      </button>
                    ) : (
                      <span className="text-slate-300 text-xs">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Footer Info & Pagination */}
      <div className="mt-5 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
        <span>
          Showing <strong>{emails.length}</strong> of <strong>{totalCount}</strong> total items
        </span>

        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 disabled:opacity-40 hover:bg-slate-50 flex items-center gap-1"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Prev</span>
            </button>
            <span className="font-semibold text-slate-600">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 disabled:opacity-40 hover:bg-slate-50 flex items-center gap-1"
            >
              <span>Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <span className="text-[11px] text-slate-400">Powered by BullMQ Queue & Elasticsearch 8</span>
      </div>
    </div>
  );
}
