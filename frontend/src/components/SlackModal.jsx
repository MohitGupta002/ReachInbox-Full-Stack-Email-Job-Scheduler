import React, { useState } from 'react';
import api, { API_ORIGIN } from '../services/api';
import toast from 'react-hot-toast';
import { X, Slack, ExternalLink, Unlink, CheckCircle2 } from 'lucide-react';

export default function SlackModal({ isOpen, onClose, slackStatus, onStatusChange }) {
  const [webhookUrl, setWebhookUrl] = useState('');
  const [channelName, setChannelName] = useState('#email-alerts');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleManualConnect = async (e) => {
    e.preventDefault();
    if (!webhookUrl.startsWith('https://hooks.slack.com/')) {
      toast.error('Webhook URL must start with https://hooks.slack.com/');
      return;
    }

    try {
      setLoading(true);
      await api.post('/slack/manual', {
        webhookUrl,
        channelName,
        teamName: 'Workspace',
      });
      toast.success('Slack webhook connected successfully!');
      if (onStatusChange) onStatusChange();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to connect Slack webhook');
    } finally {
      setLoading(false);
    }
  };

  const handleOAuthConnect = () => {
    window.location.href = `${API_ORIGIN}/api/slack/connect`;
  };

  const handleDisconnect = async () => {
    try {
      setLoading(true);
      await api.delete('/slack/disconnect');
      toast.success('Slack disconnected');
      if (onStatusChange) onStatusChange();
      onClose();
    } catch (err) {
      toast.error('Failed to disconnect');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#4A154B] flex items-center justify-center text-white">
              <Slack className="w-4 h-4" />
            </div>
            <h3 className="text-lg font-bold text-slate-800">Slack Notifications</h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {slackStatus?.connected ? (
            <div className="space-y-4">
              <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-bold text-emerald-900">Connected to Slack</h4>
                  <p className="text-xs text-emerald-700 mt-0.5">
                    Live hourly rate-limit notifications are dispatched to{' '}
                    <strong>{slackStatus.channelName || 'your channel'}</strong> with 1-hour atomic deduplication.
                  </p>
                </div>
              </div>

              <button
                onClick={handleDisconnect}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-2xl border border-rose-200 text-rose-600 hover:bg-rose-50 font-semibold text-xs transition-colors"
              >
                <Unlink className="w-4 h-4" />
                <span>Disconnect Slack Notifications</span>
              </button>
            </div>
          ) : (
            <>
              {/* Option 1: Official OAuth v2 */}
              <button
                onClick={handleOAuthConnect}
                className="w-full flex items-center justify-center gap-2.5 py-3 px-4 rounded-2xl bg-[#4A154B] hover:bg-[#3d113e] text-white font-semibold text-sm shadow-md transition-colors"
              >
                <Slack className="w-4 h-4" />
                <span>Connect via Slack OAuth v2</span>
                <ExternalLink className="w-3.5 h-3.5 opacity-80" />
              </button>

              <div className="relative flex items-center justify-center">
                <div className="border-t border-slate-200 w-full"></div>
                <span className="bg-white px-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider relative">
                  OR ENTER WEBHOOK URL
                </span>
              </div>

              {/* Option 2: Manual Webhook URL */}
              <form onSubmit={handleManualConnect} className="space-y-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">
                    Incoming Webhook URL
                  </label>
                  <input
                    type="url"
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                    placeholder="https://hooks.slack.com/services/..."
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">
                    Target Channel / Display Name
                  </label>
                  <input
                    type="text"
                    value={channelName}
                    onChange={(e) => setChannelName(e.target.value)}
                    placeholder="#email-rate-limits"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-blue-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs transition-colors"
                >
                  {loading ? 'Saving...' : 'Save Webhook Integration'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
