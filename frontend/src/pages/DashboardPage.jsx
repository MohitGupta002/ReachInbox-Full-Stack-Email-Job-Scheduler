import React, { useState, useEffect } from 'react';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';
import SystemStatusCard from '../components/SystemStatusCard';
import EfficiencyCard from '../components/EfficiencyCard';
import EmailTable from '../components/EmailTable';
import ComposeModal from '../components/ComposeModal';
import SlackModal from '../components/SlackModal';
import api from '../services/api';
import toast from 'react-hot-toast';
import {
  Mail,
  Send,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  Plus,
  KeyRound,
  Slack,
  Sparkles,
  Server,
} from 'lucide-react';

export default function DashboardPage() {
  const [activeNav, setActiveNav] = useState('insights');
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [composePrefill, setComposePrefill] = useState(null);
  const [isSlackOpen, setIsSlackOpen] = useState(false);
  const [slackStatus, setSlackStatus] = useState(null);
  const [stats, setStats] = useState(null);
  const [healthInfo, setHealthInfo] = useState(null);
  const [senders, setSenders] = useState([]);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Settings Gmail SMTP form
  const [gmailEmail, setGmailEmail] = useState('');
  const [gmailAppPass, setGmailAppPass] = useState('');
  const [gmailDisplayName, setGmailDisplayName] = useState('');
  const [gmailHourlyLimit, setGmailHourlyLimit] = useState(200);
  const [savingGmail, setSavingGmail] = useState(false);

  // AI Assistant cadence calculator state
  const [calcLeads, setCalcLeads] = useState(500);
  const [calcLimit, setCalcLimit] = useState(200);
  const [calcDelaySec, setCalcDelaySec] = useState(2);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('slack') === 'connected') {
      toast.success('Slack incoming webhook connected successfully!');
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (params.get('slack') === 'denied') {
      toast.error('Slack OAuth authorization was denied');
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (params.get('slack_modal') === 'manual') {
      setIsSlackOpen(true);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const fetchSlackStatus = async () => {
    try {
      const res = await api.get('/slack/status');
      setSlackStatus(res.data);
    } catch (err) {
      console.warn('Could not fetch Slack status:', err.message);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await api.get('/emails/stats');
      setStats((prev) => {
        if (
          prev &&
          (prev.scheduled !== res.data.scheduled ||
            prev.sent !== res.data.sent ||
            prev.rateLimited !== res.data.rateLimited ||
            prev.failed !== res.data.failed)
        ) {
          setRefreshTrigger((t) => t + 1);
        }
        return res.data;
      });
    } catch (err) {
      console.warn('Could not fetch email stats:', err.message);
    }
  };

  const fetchHealth = async () => {
    try {
      const res = await api.get('/health');
      setHealthInfo(res.data);
    } catch (err) {
      console.warn('Health check unavailable:', err.message);
    }
  };

  const fetchSendersList = async () => {
    try {
      const res = await api.get('/senders');
      setSenders(res.data || []);
    } catch (err) {
      console.warn('Could not load senders:', err.message);
    }
  };

  useEffect(() => {
    fetchSlackStatus();
    fetchStats();
    fetchHealth();
    fetchSendersList();
  }, [refreshTrigger]);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchStats();
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  const handleScheduleSuccess = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  const handleAddGmailSender = async (e) => {
    e.preventDefault();
    try {
      setSavingGmail(true);
      const res = await api.post('/senders/smtp', {
        email: gmailEmail,
        displayName: gmailDisplayName || gmailEmail,
        smtpHost: 'smtp.gmail.com',
        smtpPort: 465,
        appPassword: gmailAppPass,
        hourlyLimit: Number(gmailHourlyLimit) || 200,
        provider: 'gmail',
      });
      toast.success(res.data.message || 'Gmail SMTP sender connected!');
      setGmailEmail('');
      setGmailAppPass('');
      setGmailDisplayName('');
      setRefreshTrigger((prev) => prev + 1);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not verify Gmail SMTP');
    } finally {
      setSavingGmail(false);
    }
  };

  const handleAddEtherealSender = async () => {
    try {
      const res = await api.post('/senders/ethereal', {
        displayName: `ReachInbox Ethereal ${senders.length + 1}`,
        hourlyLimit: 200,
      });
      toast.success(`Created Ethereal sender: ${res.data.email}`);
      setRefreshTrigger((prev) => prev + 1);
    } catch (err) {
      toast.error('Failed to provision Ethereal sender');
    }
  };

  const handleDeleteSender = async (senderId) => {
    try {
      await api.delete(`/senders/${senderId}`);
      toast.success('Sender removed');
      setRefreshTrigger((prev) => prev + 1);
    } catch (err) {
      toast.error('Failed to remove sender');
    }
  };

  const estimatedHours = Math.max(1, Math.ceil((calcLeads || 0) / Math.max(1, calcLimit || 1)));
  const activeAlertCount = (stats?.rateLimited || 0) + (stats?.failed || 0);

  return (
    <div className="min-h-screen bg-[#f0f4f9] flex text-slate-800">
      <Sidebar
        activeTab={activeNav}
        setActiveTab={setActiveNav}
        alertCount={activeAlertCount}
      />

      <main className="flex-1 flex flex-col min-w-0 pb-12">
        <Header
          slackStatus={slackStatus}
          onOpenSlackModal={() => setIsSlackOpen(true)}
          onNavigateTab={setActiveNav}
          healthInfo={healthInfo}
        />

        <div className="px-8 space-y-7 max-w-7xl w-full mx-auto">
          {activeNav === 'insights' && (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-7">
                <SystemStatusCard stats={stats} />
                <EfficiencyCard
                  onOpenCompose={() => {
                    setComposePrefill(null);
                    setIsComposeOpen(true);
                  }}
                />
              </div>

              <section>
                <EmailTable
                  onOpenCompose={() => {
                    setComposePrefill(null);
                    setIsComposeOpen(true);
                  }}
                  refreshTrigger={refreshTrigger}
                  stats={stats}
                />
              </section>
            </>
          )}

          {activeNav === 'overview' && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm">
                  <div className="flex items-center justify-between text-slate-400 text-xs font-bold uppercase mb-2">
                    <span>Scheduled</span>
                    <Clock className="w-4 h-4 text-blue-500" />
                  </div>
                  <div className="text-3xl font-black text-slate-900">{stats?.scheduled ?? 0}</div>
                  <p className="text-xs text-slate-500 mt-1">Queued for future dispatch</p>
                </div>

                <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm">
                  <div className="flex items-center justify-between text-slate-400 text-xs font-bold uppercase mb-2">
                    <span>Delivered</span>
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  </div>
                  <div className="text-3xl font-black text-emerald-600">{stats?.sent ?? 0}</div>
                  <p className="text-xs text-slate-500 mt-1">Confirmed SMTP transmissions</p>
                </div>

                <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm">
                  <div className="flex items-center justify-between text-slate-400 text-xs font-bold uppercase mb-2">
                    <span>Rate Deferred</span>
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                  </div>
                  <div className="text-3xl font-black text-amber-600">{stats?.rateLimited ?? 0}</div>
                  <p className="text-xs text-slate-500 mt-1">Staggered to next UTC hour</p>
                </div>

                <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm">
                  <div className="flex items-center justify-between text-slate-400 text-xs font-bold uppercase mb-2">
                    <span>Senders & Engine</span>
                    <Server className="w-4 h-4 text-indigo-500" />
                  </div>
                  <div className="text-3xl font-black text-slate-900">{stats?.senders ?? senders.length}</div>
                  <p className="text-xs text-slate-500 mt-1">
                    DB: {healthInfo?.infrastructure?.databaseDialect || 'detecting'}
                  </p>
                </div>
              </div>

              <EmailTable
                onOpenCompose={() => {
                  setComposePrefill(null);
                  setIsComposeOpen(true);
                }}
                refreshTrigger={refreshTrigger}
                stats={stats}
              />
            </>
          )}

          {activeNav === 'assistant' && (
            <div className="bg-white rounded-3xl p-7 border border-slate-100 shadow-sm space-y-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Campaign Cadence & Rate-Limit Planner</h2>
                  <p className="text-xs text-slate-500">
                    Simulate hourly overflow behavior and launch optimized schedules directly into Compose.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-5 bg-slate-50 rounded-2xl border border-slate-100">
                <div>
                  <label className="text-xs font-bold text-slate-600 uppercase block mb-1">Lead List Size</label>
                  <input
                    type="number"
                    min="1"
                    value={calcLeads}
                    onChange={(e) => setCalcLeads(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-semibold"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 uppercase block mb-1">Hourly Cap / Sender</label>
                  <input
                    type="number"
                    min="1"
                    value={calcLimit}
                    onChange={(e) => setCalcLimit(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-semibold"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 uppercase block mb-1">Delay Between Sends (s)</label>
                  <input
                    type="number"
                    min="0"
                    value={calcDelaySec}
                    onChange={(e) => setCalcDelaySec(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-semibold"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4 p-5 rounded-2xl bg-blue-50/70 border border-blue-100">
                <div className="space-y-1">
                  <p className="text-sm font-bold text-slate-800">
                    Estimated Completion: {estimatedHours} hourly window{estimatedHours > 1 ? 's' : ''}
                  </p>
                  <p className="text-xs text-slate-600">
                    Active send time: ~{Math.round(((calcLeads || 0) * (calcDelaySec || 0)) / 60)} min across windows with zero dropped jobs.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setComposePrefill({
                      delaySec: calcDelaySec,
                      hourlyLimit: calcLimit,
                    });
                    setIsComposeOpen(true);
                  }}
                  className="px-5 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md flex items-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  <span>Apply to Campaign</span>
                </button>
              </div>
            </div>
          )}

          {activeNav === 'notifications' && (
            <div className="bg-white rounded-3xl p-7 border border-slate-100 shadow-sm space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">System & Rate-Limit Notifications</h2>
                  <p className="text-xs text-slate-500">Live telemetry for queue recovery, rate-limit rescheduling, and Slack webhooks</p>
                </div>
                <button
                  onClick={() => setIsSlackOpen(true)}
                  className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold flex items-center gap-2"
                >
                  <Slack className="w-3.5 h-3.5" />
                  <span>{slackStatus?.connected ? 'Manage Slack' : 'Connect Slack'}</span>
                </button>
              </div>

              <div className="space-y-3">
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Server className="w-4 h-4 text-blue-600" />
                    <div>
                      <p className="text-xs font-bold text-slate-800">
                        Engine Mode: {healthInfo?.infrastructure?.redisMode === 'redis_bullmq' ? 'Redis + BullMQ Live' : 'Standalone SQLite Persistent Fallback'}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Database: {healthInfo?.infrastructure?.databaseDialect || 'sqlite'} | Startup reconciliation verified
                      </p>
                    </div>
                  </div>
                  <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">Active</span>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    <div>
                      <p className="text-xs font-bold text-slate-800">
                        {stats?.rateLimited || 0} rate-limited job(s) currently staggered & {stats?.failed || 0} failed job(s)
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Slack Deduplication Lock: 1 alert / sender / UTC hour (`SET NX EX 3600`)
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setActiveNav('insights')}
                    className="text-xs font-semibold text-blue-600 hover:underline"
                  >
                    Inspect Queue
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeNav === 'settings' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-7">
              {/* Connect Real Gmail SMTP Card */}
              <div className="bg-white rounded-3xl p-7 border border-slate-100 shadow-sm space-y-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <KeyRound className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">Connect Real Gmail Sender</h2>
                    <p className="text-xs text-slate-500">
                      Send real scheduled emails via `smtp.gmail.com` using a 16-char Google App Password.
                    </p>
                  </div>
                </div>

                <form onSubmit={handleAddGmailSender} className="space-y-3.5">
                  <div>
                    <label className="text-xs font-bold text-slate-700 uppercase block mb-1">Gmail Address</label>
                    <input
                      type="email"
                      value={gmailEmail}
                      onChange={(e) => setGmailEmail(e.target.value)}
                      placeholder="you@gmail.com"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-700 uppercase block mb-1">Google App Password</label>
                    <input
                      type="password"
                      value={gmailAppPass}
                      onChange={(e) => setGmailAppPass(e.target.value)}
                      placeholder="xxxx xxxx xxxx xxxx"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-blue-500"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-bold text-slate-700 uppercase block mb-1">Display Name</label>
                      <input
                        type="text"
                        value={gmailDisplayName}
                        onChange={(e) => setGmailDisplayName(e.target.value)}
                        placeholder="Your Name"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-700 uppercase block mb-1">Hourly Limit</label>
                      <input
                        type="number"
                        min="1"
                        value={gmailHourlyLimit}
                        onChange={(e) => setGmailHourlyLimit(Number(e.target.value))}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={savingGmail}
                    className="w-full py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md transition-colors"
                  >
                    {savingGmail ? 'Verifying SMTP Connection...' : 'Verify & Connect Gmail Sender'}
                  </button>
                </form>
              </div>

              {/* Active Senders List */}
              <div className="bg-white rounded-3xl p-7 border border-slate-100 shadow-sm space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">Configured Senders ({senders.length})</h2>
                    <p className="text-xs text-slate-500">Multi-sender pool with independent hourly rate limits</p>
                  </div>
                  <button
                    onClick={handleAddEtherealSender}
                    className="px-3.5 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-600 text-xs font-bold flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Ethereal</span>
                  </button>
                </div>

                <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                  {senders.map((s) => (
                    <div
                      key={s.id}
                      className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Mail className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                          <span className="text-xs font-bold text-slate-800 truncate">{s.email}</span>
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">
                            {s.provider || 'ethereal'}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {s.smtp_host}:{s.smtp_port} • Limit: {s.hourly_limit}/hr
                        </p>
                      </div>
                      {senders.length > 1 && (
                        <button
                          onClick={() => handleDeleteSender(s.id)}
                          title="Delete Sender"
                          className="p-2 rounded-xl text-rose-500 hover:bg-rose-50 transition-colors shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      <ComposeModal
        isOpen={isComposeOpen}
        onClose={() => {
          setIsComposeOpen(false);
          setComposePrefill(null);
        }}
        onScheduleSuccess={handleScheduleSuccess}
        prefill={composePrefill}
      />

      <SlackModal
        isOpen={isSlackOpen}
        onClose={() => setIsSlackOpen(false)}
        slackStatus={slackStatus}
        onStatusChange={() => {
          fetchSlackStatus();
          setRefreshTrigger((prev) => prev + 1);
        }}
      />
    </div>
  );
}
