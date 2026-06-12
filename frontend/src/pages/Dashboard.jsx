import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { groupService } from '../services/api';
import { Plus, Users, LogOut, TrendingUp, TrendingDown, DollarSign, Wallet, RefreshCw } from 'lucide-react';

const Dashboard = () => {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Create Group Modal State
  const [showModal, setShowModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [creating, setCreating] = useState(false);
  const [modalError, setModalError] = useState('');

  // Balance Aggregations
  const [totalOwedToYou, setTotalOwedToYou] = useState(0);
  const [totalYouOwe, setTotalYouOwe] = useState(0);

  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const fetchDashboardData = async () => {
    setLoading(true);
    setError('');
    try {
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
    </div>
  );
};

export default Dashboard;
