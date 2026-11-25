import React, { useState, useEffect } from 'react';
import Papa from 'papaparse';
import api from '../services/api';
import toast from 'react-hot-toast';
import { X, Upload, Mail, Plus, CheckCircle, KeyRound } from 'lucide-react';

export default function ComposeModal({ isOpen, onClose, onScheduleSuccess, prefill }) {
  const [senders, setSenders] = useState([]);
  const [selectedSender, setSelectedSender] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [startTime, setStartTime] = useState('');
  const [delaySec, setDelaySec] = useState(2);
  const [hourlyLimit, setHourlyLimit] = useState(200);

  const [recipients, setRecipients] = useState([]);
  const [parseStats, setParseStats] = useState(null);
  const [manualRecipients, setManualRecipients] = useState('');
  const [fileName, setFileName] = useState('');
  const [loading, setLoading] = useState(false);
  const [creatingSender, setCreatingSender] = useState(false);

  // Quick Gmail SMTP modal toggle inside Compose
  const [showGmailForm, setShowGmailForm] = useState(false);
  const [gmailEmail, setGmailEmail] = useState('');
  const [gmailAppPass, setGmailAppPass] = useState('');
  const [gmailName, setGmailName] = useState('');
  const [connectingGmail, setConnectingGmail] = useState(false);

  const resetCampaignFields = () => {
    setSubject(prefill?.subject || '');
    setBody(prefill?.body || '');
    setRecipients([]);
    setParseStats(null);
    setManualRecipients('');
    setFileName('');
    if (prefill?.delaySec !== undefined) setDelaySec(prefill.delaySec);
    if (prefill?.hourlyLimit !== undefined) setHourlyLimit(prefill.hourlyLimit);
  };

  // Load senders and default time when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchSenders();
      const nextMinute = new Date(Date.now() + 60000);
      const isoLocal = new Date(nextMinute.getTime() - nextMinute.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
      setStartTime(isoLocal);
      if (prefill) {
        resetCampaignFields();
      }
    }
  }, [isOpen]);

  const fetchSenders = async () => {
    try {
      const res = await api.get('/senders');
      setSenders(res.data);
      if (res.data.length > 0 && !selectedSender) {
        setSelectedSender(res.data[0].id);
      }
    } catch (err) {
      toast.error('Failed to load senders');
    }
  };

  const handleCreateNewSender = async () => {
    try {
      setCreatingSender(true);
      const res = await api.post('/senders/ethereal', {
        displayName: 'ReachInbox Sender ' + (senders.length + 1),
        hourlyLimit: hourlyLimit || 200,
      });
      setSenders([res.data, ...senders]);
      setSelectedSender(res.data.id);
      toast.success(`Created fresh Ethereal sender: ${res.data.email}`);
    } catch (err) {
      toast.error('Could not provision test sender');
    } finally {
      setCreatingSender(false);
    }
  };

  const handleConnectGmail = async () => {
    if (!gmailEmail.trim() || !gmailAppPass.trim()) {
      toast.error('Enter your Gmail address and 16-character Google App Password');
      return;
    }

    try {
      setConnectingGmail(true);
      const res = await api.post('/senders/smtp', {
        email: gmailEmail.trim(),
        displayName: gmailName.trim() || gmailEmail.trim(),
        smtpHost: 'smtp.gmail.com',
        smtpPort: 465,
        appPassword: gmailAppPass.trim(),
        hourlyLimit: Number(hourlyLimit) || 200,
        provider: 'gmail',
      });
      setSenders([res.data, ...senders]);
      setSelectedSender(res.data.id);
      setShowGmailForm(false);
      setGmailEmail('');
      setGmailAppPass('');
      setGmailName('');
      toast.success(`Connected real Gmail SMTP: ${res.data.email}`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Gmail SMTP verification failed');
    } finally {
      setConnectingGmail(false);
    }
  };

  // PapaParse CSV / TXT File Upload Handler with duplicate & invalid counts
  const handleFileUpload = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    setFileName(file.name);

    Papa.parse(file, {
      skipEmptyLines: true,
      complete: (results) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const extracted = new Set();
        let totalCandidates = 0;
        let invalidCount = 0;

        results.data.forEach((row) => {
          const cells = Array.isArray(row)
            ? row
            : typeof row === 'object' && row !== null
            ? Object.values(row)
            : [row];

          cells.forEach((cell) => {
            const val = String(cell ?? '').trim();
            if (!val) return;
            // Skip obvious header labels like "email" cleanly while counting malformed emails
            if (/^(email|e-mail|recipient|address|name|first_name|last_name)$/i.test(val)) return;
            totalCandidates++;
            if (emailRegex.test(val)) {
              extracted.add(val.toLowerCase());
            } else if (val.includes('@') || cells.length === 1) {
              invalidCount++;
            }
          });
        });

        const list = Array.from(extracted);
        const duplicateCount = Math.max(0, totalCandidates - invalidCount - list.length);
        setRecipients(list);
        setParseStats({
          unique: list.length,
          duplicates: duplicateCount,
          invalid: invalidCount,
        });

        if (list.length > 0) {
          toast.success(`Parsed ${list.length} unique email address(es)`);
        } else {
          toast.error('No valid email addresses found in file');
        }
      },
      error: (err) => {
        toast.error(`CSV Parsing error: ${err.message}`);
      },
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    let finalRecipients = [...recipients];
    if (manualRecipients.trim()) {
      const manualList = manualRecipients
        .split(/[\n,;]+/)
        .map((item) => item.trim().toLowerCase())
        .filter((item) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item));
      finalRecipients = Array.from(new Set([...finalRecipients, ...manualList]));
    }

    if (finalRecipients.length === 0) {
      toast.error('Please upload a CSV or enter at least one valid recipient email.');
      return;
    }

    if (!selectedSender) {
      toast.error('Please select an active email sender.');
      return;
    }

    try {
      setLoading(true);
      const res = await api.post('/emails/schedule', {
        senderId: selectedSender,
        recipients: finalRecipients,
        subject,
        body,
        startTime: startTime ? new Date(startTime).toISOString() : new Date().toISOString(),
        delayMs: Number(delaySec) * 1000,
        hourlyLimit: Number(hourlyLimit),
      });

      toast.success(res.data.message || `Scheduled ${finalRecipients.length} emails!`);
      resetCampaignFields();
      if (onScheduleSuccess) onScheduleSuccess();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || 'Scheduling failed');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-7 py-5 border-b border-slate-100">
          <div>
            <h3 className="text-xl font-bold text-slate-800">Compose New Email Campaign</h3>
            <p className="text-xs text-slate-400 mt-0.5">BullMQ delayed queue with atomic per-sender rate limiting</p>
          </div>
          <button
            onClick={() => {
              resetCampaignFields();
              onClose();
            }}
            className="w-9 h-9 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-7 space-y-5 overflow-y-auto flex-1">
          {/* Sender Dropdown + Create Ethereal / Connect Gmail Buttons */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Sender Account</label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowGmailForm(!showGmailForm)}
                  className="text-xs text-emerald-600 hover:text-emerald-700 font-semibold flex items-center gap-1"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>{showGmailForm ? 'Hide Gmail Form' : 'Connect Real Gmail'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleCreateNewSender}
                  disabled={creatingSender}
                  className="text-xs text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{creatingSender ? 'Generating...' : 'Spin Up Ethereal'}</span>
                </button>
              </div>
            </div>

            <select
              value={selectedSender}
              onChange={(e) => setSelectedSender(e.target.value)}
              className="w-full px-4 py-3 rounded-2xl border border-slate-200 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors bg-white"
              required
            >
              {senders.map((s) => (
                <option key={s.id} value={s.id}>
                  [{(s.provider || 'ethereal').toUpperCase()}] {s.display_name} ({s.email}) — {s.hourly_limit}/hr
                </option>
              ))}
            </select>

            {(() => {
              const activeSenderObj = senders.find((s) => s.id === selectedSender);
              if (!activeSenderObj) return null;
              if ((activeSenderObj.provider || 'ethereal') === 'ethereal') {
                return (
                  <p className="mt-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-200/70 rounded-xl px-3 py-1.5">
                    <strong>Ethereal Sandbox Mode:</strong> Messages are trapped for safe testing and viewable via <strong>Inspect Email</strong> in Sent History (they do not arrive in real Gmail inboxes). Click <strong>Connect Real Gmail</strong> above for real inbox delivery.
                  </p>
                );
              }
              return (
                <p className="mt-1.5 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200/70 rounded-xl px-3 py-1.5">
                  <strong>Live {activeSenderObj.provider.toUpperCase()} SMTP:</strong> Emails will deliver directly to real recipient inboxes.
                </p>
              );
            })()}

            {showGmailForm && (
              <div className="mt-3 p-4 rounded-2xl bg-emerald-50/60 border border-emerald-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-900">Connect Real Gmail SMTP (smtp.gmail.com)</span>
                  <span className="text-[11px] text-emerald-700">Verified live before saving</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <input
                    type="email"
                    value={gmailEmail}
                    onChange={(e) => setGmailEmail(e.target.value)}
                    placeholder="your.address@gmail.com"
                    className="px-3 py-2 rounded-xl border border-emerald-200 bg-white text-xs focus:outline-none focus:border-emerald-500"
                  />
                  <input
                    type="password"
                    value={gmailAppPass}
                    onChange={(e) => setGmailAppPass(e.target.value)}
                    placeholder="16-char Google App Password"
                    className="px-3 py-2 rounded-xl border border-emerald-200 bg-white text-xs focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <input
                    type="text"
                    value={gmailName}
                    onChange={(e) => setGmailName(e.target.value)}
                    placeholder="Display Name (optional)"
                    className="flex-1 px-3 py-2 rounded-xl border border-emerald-200 bg-white text-xs focus:outline-none focus:border-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={handleConnectGmail}
                    disabled={connectingGmail}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors shrink-0"
                  >
                    {connectingGmail ? 'Verifying...' : 'Verify & Save Gmail'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* CSV File Upload Section */}
          <div>
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1.5">
              Lead Upload (CSV / TXT)
            </label>
            <div className="border-2 border-dashed border-slate-200 hover:border-blue-400 rounded-2xl p-5 text-center cursor-pointer transition-colors bg-slate-50/50 relative">
              <input
                type="file"
                accept=".csv,.txt"
                onChange={handleFileUpload}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <div className="flex flex-col items-center justify-center">
                <Upload className="w-8 h-8 text-blue-500 mb-2" />
                <p className="text-sm font-semibold text-slate-700">
                  {fileName ? fileName : 'Drop leads CSV or click to browse'}
                </p>
                <p className="text-xs text-slate-400 mt-1">Automatic PapaParse extraction of valid unique email addresses</p>
              </div>
            </div>

            {/* Live Detected Counter Badge */}
            {recipients.length > 0 && (
              <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 p-2.5 bg-blue-50 text-blue-700 border border-blue-200/80 rounded-xl text-xs font-semibold">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-blue-600" />
                  <span>
                    <strong>{recipients.length}</strong> unique email address(es) detected
                  </span>
                </div>
                {parseStats && (parseStats.duplicates > 0 || parseStats.invalid > 0) && (
                  <span className="text-[11px] text-blue-600">
                    ({parseStats.duplicates} duplicates removed, {parseStats.invalid} invalid filtered)
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Manual Recipients Alternative */}
          <div>
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1.5">
              Direct Recipients (Optional / Additional)
            </label>
            <textarea
              value={manualRecipients}
              onChange={(e) => setManualRecipients(e.target.value)}
              placeholder="e.g. your.gmail@gmail.com, lead2@startup.io (separated by commas or newlines)"
              rows={2}
              className="w-full px-4 py-3 rounded-2xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
            />
          </div>

          {/* Subject & Body */}
          <div>
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1.5">
              Email Subject
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Scaling ReachInbox outbound campaigns automatically"
              className="w-full px-4 py-3 rounded-2xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors font-medium"
              required
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1.5">
              Email Body
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Hello there, wanted to connect regarding your email deliverability architecture..."
              rows={4}
              className="w-full px-4 py-3 rounded-2xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors font-normal"
              required
            />
          </div>

          {/* Scheduling & Rate Limiting Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                  Start Time
                </label>
                <button
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    const isoLocal = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
                      .toISOString()
                      .slice(0, 16);
                    setStartTime(isoLocal);
                  }}
                  className="text-[10px] font-bold text-blue-600 hover:underline"
                >
                  Send Now
                </button>
              </div>
              <input
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold focus:outline-none focus:border-blue-500 bg-white"
                required
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1">
                Delay Between Sends
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={delaySec}
                  onChange={(e) => setDelaySec(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold focus:outline-none focus:border-blue-500 bg-white"
                  required
                />
                <span className="absolute right-3 top-2 text-xs font-medium text-slate-400">sec</span>
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1">
                Hourly Limit / Sender
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="1"
                  value={hourlyLimit}
                  onChange={(e) => setHourlyLimit(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold focus:outline-none focus:border-blue-500 bg-white"
                  required
                />
                <span className="absolute right-3 top-2 text-xs font-medium text-slate-400">/hr</span>
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => {
                resetCampaignFields();
                onClose();
              }}
              className="px-5 py-2.5 rounded-2xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-semibold transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold shadow-lg shadow-blue-600/25 transition-all flex items-center gap-2"
            >
              {loading ? (
                <span className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></span>
              ) : (
                <>
                  <Mail className="w-4 h-4" />
                  <span>Schedule Campaign</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
