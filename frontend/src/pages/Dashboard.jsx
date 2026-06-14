import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { groupService, importService } from '../services/api';
import { Plus, Users, LogOut, TrendingUp, TrendingDown, DollarSign, Wallet, RefreshCw, UploadCloud, AlertTriangle, CheckCircle2, X, AlertCircle, Download } from 'lucide-react';

const Dashboard = () => {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Create Group Modal State
  const [showModal, setShowModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [creating, setCreating] = useState(false);
  const [modalError, setModalError] = useState('');

  // CSV Import Modal State
  const [showImportModal, setShowImportModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [importReport, setImportReport] = useState(null);
  const [importError, setImportError] = useState('');

  // Balance Aggregations
  const [totalOwedToYou, setTotalOwedToYou] = useState(0);
  const [totalYouOwe, setTotalYouOwe] = useState(0);

  // Import Approvals state
  const [pendingApprovals, setPendingApprovals] = useState([]);

  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file && (file.type === 'text/csv' || file.name.endsWith('.csv'))) {
      setSelectedFile(file);
      setImportError('');
    } else {
      setSelectedFile(null);
      setImportError('Please select a valid CSV file');
    }
  };

  const handleCSVImport = async (e) => {
    e.preventDefault();
    if (!selectedFile) {
      setImportError('Please select a CSV file first');
      return;
    }

    setUploading(true);
    setImportError('');
    setImportReport(null);

    try {
      const res = await importService.importCSV(selectedFile);
      if (res.success) {
        setImportReport(res.report);
        fetchDashboardData(); // Refresh groups list & balances
      } else {
        setImportError(res.message || 'Import failed');
      }
    } catch (err) {
      setImportError(err.message || 'Import failed');
    } finally {
      setUploading(false);
    }
  };

  /**
   * Generates and downloads a CSV export of the current import report
   * using data already available in the importReport state.
   * No additional API call is required.
   */
  const downloadImportReport = () => {
    if (!importReport) return;

    const { id, filename, status, createdAt, statistics, anomalies } = importReport;

    // Derive row counts from available statistics
    const totalAnomalyRows = statistics.totalAnomalies;
    const failedRows = statistics.skippedRowsCount;
    const pendingRows = anomalies.filter(
      (a) => a.actionTaken === 'Queued for Approval' || a.actionTaken === 'Pending Approval'
    ).length;
    // Successful = not skipped, not aborted, not pending approval
    const nonSuccessActions = new Set(['Skipped Row', 'Aborted Import', 'Queued for Approval', 'Pending Approval']);
    const successfulRows = anomalies.filter((a) => !nonSuccessActions.has(a.actionTaken)).length;

    // Build CSV lines
    const lines = [];

    // --- Section 1: Summary Header ---
    lines.push('CSV Import Report');
    lines.push(`Generated At,${new Date().toISOString()}`);
    lines.push('');

    // --- Section 2: Import Metadata ---
    lines.push('Import Summary');
    lines.push(`Import ID,${id}`);
    lines.push(`Source File,"${filename || 'N/A'}"`);
    lines.push(`Import Date,${createdAt ? new Date(createdAt).toLocaleString() : 'N/A'}`);
    lines.push(`Run Status,${status}`);
    lines.push(`Total Anomalies Detected,${totalAnomalyRows}`);
    lines.push(`Skipped / Failed Rows,${failedRows}`);
    lines.push(`Pending Approvals,${pendingRows}`);
    lines.push(`Rows with Anomalies Imported,${successfulRows}`);
    lines.push('');

    // --- Section 3: Anomaly Detail Table ---
    lines.push('Anomaly Details');
    lines.push('Row Number,Anomaly Type,Issue Description,Action Taken,Approval Status');

    if (anomalies.length === 0) {
      lines.push(',,,, No anomalies detected — all rows imported cleanly.');
    } else {
      anomalies.forEach((anomaly) => {
        // Determine approval status from actionTaken field
        let approvalStatus = 'N/A';
        if (anomaly.actionTaken === 'Approved by User') approvalStatus = 'APPROVED';
        else if (anomaly.actionTaken === 'Rejected by User') approvalStatus = 'REJECTED';
        else if (
          anomaly.actionTaken === 'Queued for Approval' ||
          anomaly.actionTaken === 'Pending Approval'
        ) approvalStatus = 'PENDING';
        else if (anomaly.actionTaken === 'Skipped Row') approvalStatus = 'SKIPPED';
        else if (anomaly.actionTaken === 'Aborted Import') approvalStatus = 'ABORTED';

        // Escape any commas or quotes inside fields
        const escapeCSV = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;

        lines.push(
          [
            anomaly.rowNumber,
            escapeCSV(anomaly.anomalyType),
            escapeCSV(anomaly.description),
            escapeCSV(anomaly.actionTaken),
            escapeCSV(approvalStatus),
          ].join(',')
        );
      });
    }

    // Trigger browser download
    const csvContent = lines.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeFilename = (filename || 'import').replace(/[^a-z0-9_-]/gi, '_').replace(/\.csv$/i, '');
    link.href = url;
    link.setAttribute('download', `import_report_${safeFilename}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const fetchPendingApprovals = async () => {
    try {
      const res = await importService.getPendingApprovals();
      if (res.success) {
        setPendingApprovals(res.data);
      }
    } catch (err) {
      console.error('Failed to fetch pending approvals', err);
    }
  };

  const handleApproveAction = async (id, action) => {
    if (!window.confirm(`Are you sure you want to ${action.toLowerCase()} this import?`)) return;
    try {
      const res = await importService.actionApproval(id, action);
      if (res.success) {
        fetchDashboardData();
        fetchPendingApprovals();
      } else {
        alert(res.message);
      }
    } catch (err) {
      alert(err.message || 'Action failed');
    }
  };

  const fetchDashboardData = async () => {
    setLoading(true);
    setError('');
    try {
      // Also fetch approvals
      fetchPendingApprovals();

      const res = await groupService.listGroups();
      if (res.success) {
        setGroups(res.data);
        
        // Calculate overall balances by fetching individual group details in parallel
        let owedToYouSum = 0;
        let youOweSum = 0;

        const detailPromises = res.data.map(g => groupService.getGroupDetails(g.id));
        const detailsResults = await Promise.all(detailPromises);

        detailsResults.forEach(detailRes => {
          if (detailRes.success && detailRes.data.balances) {
            const userBal = detailRes.data.balances.find(b => b.userId === user.id);
            if (userBal) {
              const net = userBal.netBalance;
              if (net > 0) {
                owedToYouSum += net;
              } else if (net < 0) {
                youOweSum += Math.abs(net);
              }
            }
          }
        });

        setTotalOwedToYou(Number(owedToYouSum.toFixed(2)));
        setTotalYouOwe(Number(youOweSum.toFixed(2)));
      } else {
        setError(res.message);
      }
    } catch (err) {
      setError('Failed to load dashboard data. Please reload.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    fetchPendingApprovals();
  }, []);

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    setModalError('');
    if (!newGroupName || newGroupName.trim() === '') {
      setModalError('Group name is required');
      return;
    }

    setCreating(true);
    try {
      const res = await groupService.createGroup(newGroupName);
      if (res.success) {
        setNewGroupName('');
        setShowModal(false);
        fetchDashboardData(); // Refresh list
      } else {
        setModalError(res.message);
      }
    } catch (err) {
      setModalError(err.message || 'Failed to create group');
    } finally {
      setCreating(false);
    }
  };

  const netOverall = Number((totalOwedToYou - totalYouOwe).toFixed(2));

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      {/* Top Navbar */}
      <nav className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/80 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 justify-between items-center">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500 text-white font-bold shadow-md shadow-emerald-500/10">
                S
              </div>
              <span className="text-xl font-bold tracking-tight text-slate-900">Splitwise MVP</span>
              <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-600 border border-emerald-100">INR</span>
            </div>
            
            <div className="flex items-center gap-4">
              <span className="hidden sm:inline text-sm font-medium text-slate-600">
                Hi, <span className="font-semibold text-slate-900">{user?.name}</span>
              </span>
              <button 
                onClick={logout}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-all"
              >
                <LogOut className="h-3.5 w-3.5" />
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Container */}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-8">
        
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Dashboard</h1>
            <p className="text-sm text-slate-500 mt-1">Settle expenses and view transaction history</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchDashboardData}
              disabled={loading}
              className="p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 disabled:opacity-50 transition-all"
              title="Refresh"
            >
              <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => setShowImportModal(true)}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 px-4 py-2.5 text-sm font-semibold transition-all shadow-sm"
            >
              <UploadCloud className="h-5 w-5 text-slate-500" />
              Import CSV
            </button>
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 shadow-md shadow-emerald-600/15 transition-all"
            >
              <Plus className="h-5 w-5" />
              Create Group
            </button>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="rounded-xl bg-red-50 p-4 text-sm font-medium text-red-600 border border-red-100 shadow-sm">
            {error}
          </div>
        )}

        {/* Balance Summaries Banner */}
        <div className="grid gap-4 sm:grid-cols-3">
          {/* Owed To You */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm relative overflow-hidden flex flex-col justify-between">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Owed to you</p>
                <h3 className="text-2xl font-extrabold text-emerald-600 mt-1">₹{totalOwedToYou}</h3>
              </div>
              <div className="rounded-lg bg-emerald-50 p-2 text-emerald-600">
                <TrendingUp className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-4 text-xs text-slate-500">Total payments you should receive</div>
          </div>

          {/* You Owe */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm relative overflow-hidden flex flex-col justify-between">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">You owe</p>
                <h3 className="text-2xl font-extrabold text-rose-600 mt-1">₹{totalYouOwe}</h3>
              </div>
              <div className="rounded-lg bg-rose-50 p-2 text-rose-600">
                <TrendingDown className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-4 text-xs text-slate-500">Total payments you need to settle</div>
          </div>

          {/* Net Balance */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm relative overflow-hidden flex flex-col justify-between">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Net balance</p>
                <h3 className={`text-2xl font-extrabold mt-1 ${netOverall >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {netOverall >= 0 ? `₹${netOverall}` : `-₹${Math.abs(netOverall)}`}
                </h3>
              </div>
              <div className={`rounded-lg p-2 ${netOverall >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                <Wallet className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-4 text-xs text-slate-500">Your total financial standing</div>
          </div>
        </div>

        {/* Pending Approvals Panel */}
        {pendingApprovals.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="border-b border-slate-200/80 px-6 py-4 flex justify-between items-center bg-amber-50/20">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500 animate-pulse" />
                Pending Import Approvals ({pendingApprovals.length})
              </h2>
            </div>
            <div className="p-4 divide-y divide-slate-100 max-h-96 overflow-y-auto">
              {pendingApprovals.map((appr) => (
                <div key={appr.id} className="py-4 first:pt-0 last:pb-0 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="rounded-md bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 border border-amber-200">
                        {appr.anomalyType}
                      </span>
                      <span className="text-xs text-slate-400 font-semibold">Row {appr.rowNumber}</span>
                      <span className="text-xs text-slate-400">Group Name: <span className="font-semibold text-slate-700">{appr.groupName}</span></span>
                    </div>
                    <p className="text-sm font-bold text-slate-900">{appr.description || '(No Description)'}</p>
                    <p className="text-xs text-slate-500">
                      Payer: <span className="font-semibold text-slate-600">{appr.payerEmail}</span> • 
                      Amount: <span className="font-bold text-slate-700">{appr.originalCurrency === 'USD' ? `$${appr.originalAmount}` : `₹${appr.originalAmount}`}</span>
                      {appr.originalCurrency === 'USD' && ` (Converted: ₹${appr.convertedAmount})`}
                    </p>
                    {appr.splitsJson && (
                      <p className="text-[11px] text-slate-400">
                        Participants: {JSON.parse(appr.splitsJson).map(s => `${s.email} (${appr.originalCurrency === 'USD' ? `$${s.splitValue}` : `₹${s.splitValue}`})`).join(', ')}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2 w-full md:w-auto shrink-0">
                    <button
                      onClick={() => handleApproveAction(appr.id, 'REJECT')}
                      className="flex-1 md:flex-none flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white hover:bg-rose-50 text-slate-600 hover:text-rose-600 px-3.5 py-2 text-xs font-bold transition-all"
                    >
                      Reject
                    </button>
                    <button
                      onClick={() => handleApproveAction(appr.id, 'APPROVE')}
                      className="flex-1 md:flex-none flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 text-xs font-bold shadow-sm shadow-emerald-600/10 transition-all"
                    >
                      Approve
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Groups List section */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="border-b border-slate-200/80 px-6 py-4 flex justify-between items-center bg-slate-50/50">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Users className="h-5 w-5 text-slate-400" />
              Your Groups ({groups.length})
            </h2>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent"></div>
              <p className="text-sm font-medium text-slate-400">Loading your groups...</p>
            </div>
          ) : groups.length === 0 ? (
            <div className="text-center py-16 px-4">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
                <Users className="h-6 w-6" />
              </div>
              <h3 className="mt-4 text-sm font-semibold text-slate-900">No groups found</h3>
              <p className="mt-1 text-sm text-slate-500">Get started by creating a new group with your friends</p>
              <button
                onClick={() => setShowModal(true)}
                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition-all shadow-sm"
              >
                <Plus className="h-4 w-4" />
                Create Group
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {groups.map((group) => (
                <div
                  key={group.id}
                  onClick={() => navigate(`/group/${group.id}`)}
                  className="flex items-center justify-between p-6 hover:bg-slate-50/50 cursor-pointer transition-all group"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 font-semibold group-hover:scale-105 transition-transform">
                      {group.name.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-950 group-hover:text-emerald-700 transition-colors">
                        {group.name}
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Created by {group.creator.id === user.id ? 'You' : group.creator.name} • {group.membersCount} members
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="inline-flex items-center rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                      View details
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Create Group Modal Overlay */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200/80 shadow-2xl p-6 relative animate-in fade-in-50 zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-slate-900 mb-4">Create New Group</h3>
            
            <form onSubmit={handleCreateGroup} className="space-y-4">
              {modalError && (
                <div className="rounded-lg bg-red-50 p-3 text-sm font-medium text-red-600 border border-red-100">
                  {modalError}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Group Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Goa Trip 2026, Roommates"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  className="block w-full rounded-xl border border-slate-200 bg-white py-3 px-3.5 text-slate-950 placeholder-slate-400 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 focus:outline-none sm:text-sm transition-all"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setNewGroupName('');
                    setModalError('');
                  }}
                  className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:bg-emerald-400 shadow-md shadow-emerald-600/10 transition-all"
                >
                  {creating ? (
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                  ) : (
                    'Create'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CSV Import Modal Overlay */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl bg-white rounded-2xl border border-slate-200/80 shadow-2xl p-6 relative max-h-[85vh] flex flex-col animate-in fade-in-50 zoom-in-95 duration-200">
            <button
              onClick={() => {
                setShowImportModal(false);
                setSelectedFile(null);
                setImportReport(null);
                setImportError('');
              }}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>

            <h3 className="text-xl font-bold text-slate-900 pr-8">Import Expenses from CSV</h3>
            <p className="text-xs text-slate-400 mt-1">Upload a Splitwise-formatted CSV file to batch-import group expenses with real-time validation.</p>

            <div className="flex-1 overflow-y-auto mt-4 pr-1 space-y-4">
              {importError && (
                <div className="rounded-xl bg-red-50 p-4 text-sm font-medium text-red-600 border border-red-100 flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                  <div>{importError}</div>
                </div>
              )}

              {!importReport ? (
                <form onSubmit={handleCSVImport} className="space-y-4">
                  <div className="border-2 border-dashed border-slate-200 hover:border-emerald-500 rounded-2xl p-8 text-center bg-slate-50/50 hover:bg-emerald-50/5 cursor-pointer transition-all relative">
                    <input
                      type="file"
                      accept=".csv"
                      onChange={handleFileChange}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <UploadCloud className="mx-auto h-12 w-12 text-slate-400 mb-3" />
                    <span className="block text-sm font-semibold text-slate-900">
                      {selectedFile ? selectedFile.name : 'Select or drag your CSV file'}
                    </span>
                    <span className="block text-xs text-slate-400 mt-1">
                      {selectedFile ? `${(selectedFile.size / 1024).toFixed(1)} KB` : 'Supports standard .csv file format'}
                    </span>
                  </div>

                  <div className="flex justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowImportModal(false);
                        setSelectedFile(null);
                        setImportError('');
                      }}
                      className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={uploading || !selectedFile}
                      className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:bg-emerald-300 disabled:cursor-not-allowed shadow-md shadow-emerald-600/10 transition-all"
                    >
                      {uploading ? (
                        <>
                          <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                          Processing Import...
                        </>
                      ) : (
                        'Upload and Import'
                      )}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="space-y-5">
                  {/* Status Summary Banner */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-slate-50 rounded-xl p-4 border border-slate-200/50 text-center">
                      <span className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">Run Status</span>
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold mt-1 border ${
                        importReport.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                        importReport.status === 'PARTIAL' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                        'bg-rose-50 text-rose-700 border-rose-200'
                      }`}>
                        {importReport.status}
                      </span>
                    </div>

                    <div className="bg-slate-50 rounded-xl p-4 border border-slate-200/50 text-center">
                      <span className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">Anomalies</span>
                      <span className="block text-xl font-black text-slate-900 mt-0.5">
                        {importReport.statistics.totalAnomalies}
                      </span>
                    </div>

                    <div className="bg-slate-50 rounded-xl p-4 border border-slate-200/50 text-center">
                      <span className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">Skipped Rows</span>
                      <span className="block text-xl font-black text-rose-600 mt-0.5">
                        {importReport.statistics.skippedRowsCount}
                      </span>
                    </div>
                  </div>

                  {/* Anomalies Table */}
                  <div className="border border-slate-200/80 rounded-xl overflow-hidden bg-white">
                    <div className="bg-slate-50 px-4 py-3 border-b border-slate-200/85">
                      <h4 className="text-sm font-bold text-slate-900">Validation Logs & Anomalies</h4>
                    </div>

                    {importReport.anomalies.length === 0 ? (
                      <div className="p-8 text-center text-slate-500">
                        <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500 mb-2" />
                        <p className="text-sm font-semibold text-slate-950">Zero Anomalies Detected!</p>
                        <p className="text-xs text-slate-400 mt-0.5">All expenses were successfully validated and imported.</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto max-h-[30vh]">
                        <table className="min-w-full divide-y divide-slate-100 text-left text-xs">
                          <thead className="bg-slate-50/50 text-slate-500 font-semibold sticky top-0 border-b border-slate-100 backdrop-blur-md">
                            <tr>
                              <th className="px-4 py-2.5">Row</th>
                              <th className="px-4 py-2.5">Anomaly Type</th>
                              <th className="px-4 py-2.5">Issue Description</th>
                              <th className="px-4 py-2.5">Action Taken</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-slate-750">
                            {importReport.anomalies.map((anomaly) => (
                              <tr key={anomaly.id} className="hover:bg-slate-50/40">
                                <td className="px-4 py-2.5 font-semibold text-slate-900">{anomaly.rowNumber}</td>
                                <td className="px-4 py-2.5 font-medium">
                                  <span className="inline-flex items-center rounded bg-slate-100 px-2 py-0.5 font-bold text-[10px] text-slate-700 border border-slate-200/50">
                                    {anomaly.anomalyType}
                                  </span>
                                </td>
                                <td className="px-4 py-2.5 text-slate-500">{anomaly.description}</td>
                                <td className="px-4 py-2.5 font-medium">
                                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold border ${
                                    anomaly.actionTaken === 'Skipped Row' || anomaly.actionTaken === 'Aborted Import'
                                      ? 'bg-rose-50 text-rose-700 border-rose-200/50'
                                      : 'bg-amber-50 text-amber-700 border-amber-200/50'
                                  }`}>
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

                  <div className="flex justify-between items-center pt-2">
                    {/* Download Report Button */}
                    <button
                      type="button"
                      id="download-import-report-btn"
                      onClick={downloadImportReport}
                      className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 px-4 py-2.5 text-sm font-semibold text-emerald-700 hover:text-emerald-800 transition-all"
                      title="Download this import report as a CSV file"
                    >
                      <Download className="h-4 w-4" />
                      Download Report
                    </button>

                    {/* Done & Close Button */}
                    <button
                      type="button"
                      onClick={() => {
                        setShowImportModal(false);
                        setSelectedFile(null);
                        setImportReport(null);
                        setImportError('');
                      }}
                      className="rounded-xl bg-slate-900 hover:bg-slate-800 px-5 py-2.5 text-sm font-semibold text-white transition-all shadow-md"
                    >
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
