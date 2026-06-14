import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { groupService, importService } from '../services/api';
import { Plus, Users, LogOut, TrendingUp, TrendingDown, Wallet, RefreshCw, UploadCloud, AlertTriangle, CheckCircle2, X, AlertCircle, Download, SplitSquareVertical, ChevronRight } from 'lucide-react';

const Dashboard = () => {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [creating, setCreating] = useState(false);
  const [modalError, setModalError] = useState('');
  const [showImportModal, setShowImportModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [importReport, setImportReport] = useState(null);
  const [importError, setImportError] = useState('');
  const [totalOwedToYou, setTotalOwedToYou] = useState(0);
  const [totalYouOwe, setTotalYouOwe] = useState(0);
  const [pendingApprovals, setPendingApprovals] = useState([]);
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file && (file.type === 'text/csv' || file.name.endsWith('.csv'))) {
      setSelectedFile(file); setImportError('');
    } else { setSelectedFile(null); setImportError('Please select a valid CSV file'); }
  };

  const handleCSVImport = async (e) => {
    e.preventDefault();
    if (!selectedFile) { setImportError('Please select a CSV file first'); return; }
    setUploading(true); setImportError(''); setImportReport(null);
    try {
      const res = await importService.importCSV(selectedFile);
      if (res.success) { setImportReport(res.report); fetchDashboardData(); }
      else setImportError(res.message || 'Import failed');
    } catch (err) { setImportError(err.message || 'Import failed'); }
    finally { setUploading(false); }
  };

  const fetchPendingApprovals = async () => {
    try {
      const res = await importService.getPendingApprovals();
      if (res.success) setPendingApprovals(res.data);
    } catch {}
  };

  const handleApproveAction = async (id, action) => {
    if (!window.confirm(`Are you sure you want to ${action.toLowerCase()} this import?`)) return;
    try {
      const res = await importService.actionApproval(id, action);
      if (res.success) { fetchDashboardData(); fetchPendingApprovals(); }
      else alert(res.message);
    } catch (err) { alert(err.message || 'Action failed'); }
  };

  const fetchDashboardData = async () => {
    setLoading(true); setError('');
    try {
      fetchPendingApprovals();
      const res = await groupService.listGroups();
      if (res.success) {
        setGroups(res.data);
        let owedToYouSum = 0, youOweSum = 0;
        const detailsResults = await Promise.all(res.data.map(g => groupService.getGroupDetails(g.id)));
        detailsResults.forEach(dr => {
          if (dr.success && dr.data.balances) {
            const b = dr.data.balances.find(b => b.userId === user.id);
            if (b) { if (b.netBalance > 0) owedToYouSum += b.netBalance; else if (b.netBalance < 0) youOweSum += Math.abs(b.netBalance); }
          }
        });
        setTotalOwedToYou(Number(owedToYouSum.toFixed(2)));
        setTotalYouOwe(Number(youOweSum.toFixed(2)));
      } else setError(res.message);
    } catch { setError('Failed to load dashboard data.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchDashboardData(); }, []);

  const handleCreateGroup = async (e) => {
    e.preventDefault(); setModalError('');
    if (!newGroupName.trim()) { setModalError('Group name is required'); return; }
    setCreating(true);
    try {
      const res = await groupService.createGroup(newGroupName);
      if (res.success) { setNewGroupName(''); setShowModal(false); fetchDashboardData(); }
      else setModalError(res.message);
    } catch (err) { setModalError(err.message || 'Failed to create group'); }
    finally { setCreating(false); }
  };

  const downloadImportReport = () => {
    if (!importReport) return;
    const { id, filename, status, createdAt, statistics, anomalies } = importReport;
    const failedRows = statistics.skippedRowsCount;
    const pendingRows = anomalies.filter(a => a.actionTaken === 'Queued for Approval' || a.actionTaken === 'Pending Approval').length;
    const nonSuccessActions = new Set(['Skipped Row', 'Aborted Import', 'Queued for Approval', 'Pending Approval']);
    const successfulRows = anomalies.filter(a => !nonSuccessActions.has(a.actionTaken)).length;
    const lines = [
      'CSV Import Report', `Generated At,${new Date().toISOString()}`, '',
      'Import Summary', `Import ID,${id}`, `Source File,"${filename || 'N/A'}"`,
      `Import Date,${createdAt ? new Date(createdAt).toLocaleString() : 'N/A'}`, `Run Status,${status}`,
      `Total Anomalies Detected,${statistics.totalAnomalies}`, `Skipped / Failed Rows,${failedRows}`,
      `Pending Approvals,${pendingRows}`, `Rows with Anomalies Imported,${successfulRows}`, '',
      'Anomaly Details', 'Row Number,Anomaly Type,Issue Description,Action Taken,Approval Status'
    ];
    if (anomalies.length === 0) lines.push(',,,, No anomalies detected.');
    else anomalies.forEach(a => {
      let s = 'N/A';
      if (a.actionTaken === 'Approved by User') s = 'APPROVED';
      else if (a.actionTaken === 'Rejected by User') s = 'REJECTED';
      else if (a.actionTaken === 'Skipped Row') s = 'SKIPPED';
      else if (a.actionTaken === 'Aborted Import') s = 'ABORTED';
      const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
      lines.push([a.rowNumber, esc(a.anomalyType), esc(a.description), esc(a.actionTaken), esc(s)].join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `import_report_${(filename||'import').replace(/[^a-z0-9_-]/gi,'_').replace(/\.csv$/i,'')}_${Date.now()}.csv`);
    document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url);
  };

  const netOverall = Number((totalOwedToYou - totalYouOwe).toFixed(2));

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-base)' }}>
      {/* Navbar */}
      <nav className="navbar sticky top-0 z-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 justify-between items-center">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg gradient-brand shadow-glow-teal">
                <SplitSquareVertical className="h-4 w-4 text-surface-900" />
              </div>
              <span className="text-base font-bold text-white">SplitVise</span>
              <span className="badge-green ml-1">INR</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="hidden sm:inline text-sm text-slate-400">
                Hi, <span className="font-semibold text-white">{user?.name}</span>
              </span>
              <button onClick={logout} className="btn-ghost flex items-center gap-1.5 py-1.5 px-3 text-xs">
                <LogOut className="h-3.5 w-3.5" /> Logout
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-black text-white tracking-tight">Dashboard</h1>
            <p className="text-sm text-slate-500 mt-1">Manage shared expenses and settle debts</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={fetchDashboardData} disabled={loading} className="btn-ghost p-2.5" title="Refresh">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={() => setShowImportModal(true)} className="btn-ghost flex items-center gap-2 px-4 py-2.5 text-sm">
              <UploadCloud className="h-4 w-4" /> Import CSV
            </button>
            <button onClick={() => setShowModal(true)} className="btn-brand flex items-center gap-2 py-2.5 px-4 text-sm">
              <Plus className="h-4 w-4" /> New Group
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-4 text-sm text-red-400">{error}</div>
        )}

        {/* Balance Stats */}
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { label: 'Owed to You', value: `₹${totalOwedToYou}`, icon: TrendingUp, positive: true },
            { label: 'You Owe', value: `₹${totalYouOwe}`, icon: TrendingDown, positive: false },
            { label: 'Net Balance', value: netOverall >= 0 ? `₹${netOverall}` : `-₹${Math.abs(netOverall)}`, icon: Wallet, positive: netOverall >= 0 },
          ].map(({ label, value, icon: Icon, positive }) => (
            <div key={label} className="stat-card">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</p>
                  <p className={`text-2xl font-black mt-1 ${positive ? 'amount-positive' : 'amount-negative'}`}>{value}</p>
                </div>
                <div className={`rounded-xl p-2 ${positive ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
                  <Icon className={`h-5 w-5 ${positive ? 'text-emerald-400' : 'text-red-400'}`} />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Pending Approvals */}
        {pendingApprovals.length > 0 && (
          <div className="glass-card overflow-hidden">
            <div className="px-6 py-4 border-b flex items-center gap-2" style={{ borderColor: 'var(--border)' }}>
              <AlertTriangle className="h-4 w-4 text-amber-400 animate-pulse" />
              <h2 className="font-bold text-white">Pending Import Approvals ({pendingApprovals.length})</h2>
            </div>
            <div className="p-4 divide-y max-h-80 overflow-y-auto" style={{ borderColor: 'var(--border)' }}>
              {pendingApprovals.map(appr => (
                <div key={appr.id} className="py-4 first:pt-0 last:pb-0 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="badge-amber">{appr.anomalyType}</span>
                      <span className="text-xs text-slate-500 font-semibold">Row {appr.rowNumber}</span>
                    </div>
                    <p className="text-sm font-bold text-white">{appr.description || '(No Description)'}</p>
                    <p className="text-xs text-slate-500">
                      Payer: <span className="text-slate-300">{appr.payerEmail}</span> •
                      Amount: <span className="text-slate-300 font-bold">{appr.originalCurrency === 'USD' ? `$${appr.originalAmount}` : `₹${appr.originalAmount}`}</span>
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleApproveAction(appr.id, 'REJECT')} className="btn-ghost px-3 py-1.5 text-xs hover:border-red-500/40 hover:text-red-400">Reject</button>
                    <button onClick={() => handleApproveAction(appr.id, 'APPROVE')} className="btn-brand px-3 py-1.5 text-xs">Approve</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Groups List */}
        <div className="glass-card overflow-hidden">
          <div className="px-6 py-4 border-b flex items-center gap-2" style={{ borderColor: 'var(--border)' }}>
            <Users className="h-4 w-4 text-slate-500" />
            <h2 className="font-bold text-white">Your Groups ({groups.length})</h2>
          </div>
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
              <p className="text-sm text-slate-500">Loading groups...</p>
            </div>
          ) : groups.length === 0 ? (
            <div className="text-center py-16 px-4">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-600 mb-4">
                <Users className="h-6 w-6 text-slate-500" />
              </div>
              <h3 className="text-sm font-semibold text-white">No groups yet</h3>
              <p className="mt-1 text-sm text-slate-500">Create a group to start splitting expenses</p>
              <button onClick={() => setShowModal(true)} className="btn-brand flex items-center gap-2 mx-auto mt-5 text-sm py-2 px-4">
                <Plus className="h-4 w-4" /> Create Group
              </button>
            </div>
          ) : (
            <div>
              {groups.map(group => (
                <div key={group.id} onClick={() => navigate(`/group/${group.id}`)} className="list-row px-6 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl gradient-brand text-surface-900 font-black text-sm flex-shrink-0">
                      {group.name.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-bold text-white">{group.name}</h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        By {group.creator.id === user.id ? 'You' : group.creator.name} · {group.membersCount} members
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-600" />
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Create Group Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center modal-overlay p-4">
          <div className="w-full max-w-md glass-card p-6 shadow-card animate-slide-up">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-white">Create New Group</h3>
              <button onClick={() => { setShowModal(false); setNewGroupName(''); setModalError(''); }} className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-surface-500 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleCreateGroup} className="space-y-4">
              {modalError && <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400">{modalError}</div>}
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Group Name</label>
                <input type="text" required placeholder="e.g. Goa Trip, Roommates" value={newGroupName} onChange={e => setNewGroupName(e.target.value)} className="input-dark" />
              </div>
              <div className="flex justify-end gap-3 pt-1">
                <button type="button" onClick={() => { setShowModal(false); setNewGroupName(''); setModalError(''); }} className="btn-ghost px-4 py-2 text-sm">Cancel</button>
                <button type="submit" disabled={creating} className="btn-brand px-4 py-2 text-sm flex items-center gap-2">
                  {creating ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-surface-900 border-t-transparent" /> : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CSV Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center modal-overlay p-4">
          <div className="w-full max-w-2xl glass-card p-6 shadow-card max-h-[85vh] flex flex-col animate-slide-up">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-xl font-bold text-white">Import Expenses from CSV</h3>
              <button onClick={() => { setShowImportModal(false); setSelectedFile(null); setImportReport(null); setImportError(''); }} className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-surface-500 transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-xs text-slate-500 mb-5">Upload a Splitwise-formatted CSV to batch-import group expenses.</p>

            <div className="flex-1 overflow-y-auto space-y-4">
              {importError && (
                <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3.5 text-sm text-red-400 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />{importError}
                </div>
              )}

              {!importReport ? (
                <form onSubmit={handleCSVImport} className="space-y-4">
                  <div className="border-2 border-dashed rounded-2xl p-10 text-center transition-colors hover:border-brand-500/50 cursor-pointer relative" style={{ borderColor: 'rgba(255,255,255,0.1)', background: 'var(--bg-surface)' }}>
                    <input type="file" accept=".csv" onChange={handleFileChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                    <UploadCloud className="mx-auto h-10 w-10 text-slate-600 mb-3" />
                    <p className="text-sm font-semibold text-slate-300">{selectedFile ? selectedFile.name : 'Select or drag CSV file here'}</p>
                    <p className="text-xs text-slate-600 mt-1">{selectedFile ? `${(selectedFile.size / 1024).toFixed(1)} KB` : 'Supports .csv format'}</p>
                  </div>
                  <div className="flex justify-end gap-3">
                    <button type="button" onClick={() => { setShowImportModal(false); setSelectedFile(null); setImportError(''); }} className="btn-ghost px-4 py-2 text-sm">Cancel</button>
                    <button type="submit" disabled={uploading || !selectedFile} className="btn-brand px-4 py-2 text-sm flex items-center gap-2">
                      {uploading ? <><div className="h-4 w-4 animate-spin rounded-full border-2 border-surface-900 border-t-transparent" /> Processing...</> : 'Upload & Import'}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="space-y-5">
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'Run Status', value: importReport.status },
                      { label: 'Anomalies', value: importReport.statistics.totalAnomalies },
                      { label: 'Skipped Rows', value: importReport.statistics.skippedRowsCount },
                    ].map(({ label, value }) => (
                      <div key={label} className="rounded-xl p-4 text-center" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</p>
                        <p className="text-lg font-black text-white mt-1">{value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                    <div className="px-4 py-3 border-b" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
                      <h4 className="text-sm font-bold text-white">Validation Logs & Anomalies</h4>
                    </div>
                    {importReport.anomalies.length === 0 ? (
                      <div className="p-8 text-center">
                        <CheckCircle2 className="mx-auto h-10 w-10 text-brand-500 mb-2" />
                        <p className="text-sm font-semibold text-white">Zero Anomalies Detected!</p>
                        <p className="text-xs text-slate-500 mt-1">All rows imported cleanly.</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto max-h-[28vh]">
                        <table className="min-w-full text-left text-xs">
                          <thead className="sticky top-0" style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)' }}>
                            <tr>
                              {['Row', 'Anomaly Type', 'Issue', 'Action Taken'].map(h => (
                                <th key={h} className="px-4 py-2.5 text-slate-500 font-semibold">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {importReport.anomalies.map(anomaly => (
                              <tr key={anomaly.id} className="border-b hover:bg-white/2" style={{ borderColor: 'var(--border)' }}>
                                <td className="px-4 py-2.5 font-bold text-white">{anomaly.rowNumber}</td>
                                <td className="px-4 py-2.5"><span className="badge-amber">{anomaly.anomalyType}</span></td>
                                <td className="px-4 py-2.5 text-slate-400">{anomaly.description}</td>
                                <td className="px-4 py-2.5">
                                  <span className={anomaly.actionTaken === 'Skipped Row' || anomaly.actionTaken === 'Aborted Import' ? 'badge-red' : 'badge-amber'}>
                                    {anomaly.actionTaken}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  <div className="flex justify-between items-center pt-1">
                    <button onClick={downloadImportReport} className="btn-ghost flex items-center gap-2 px-4 py-2 text-sm text-brand-400 border-brand-500/30 hover:border-brand-500/60">
                      <Download className="h-4 w-4" /> Download Report
                    </button>
                    <button onClick={() => { setShowImportModal(false); setSelectedFile(null); setImportReport(null); setImportError(''); }} className="btn-brand px-5 py-2 text-sm">
                      Done & Refresh
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
