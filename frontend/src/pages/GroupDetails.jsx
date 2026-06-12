import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { groupService, expenseService, settlementService } from '../services/api';
import { ArrowLeft, Plus, Users, Landmark, Trash2, ArrowRightLeft, UserCheck, MessageSquare, AlertCircle } from 'lucide-react';

const GroupDetails = () => {
  const { id: groupId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [group, setGroup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Add Member State
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [addingMember, setAddingMember] = useState(false);
  const [memberError, setMemberError] = useState('');

  // Create Expense Modal State
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [expenseDesc, setExpenseDesc] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expensePayer, setExpensePayer] = useState('');
  const [expenseSplitType, setExpenseSplitType] = useState('EQUAL');
  const [expenseSplits, setExpenseSplits] = useState({}); // { userId: value }
  const [expenseError, setExpenseError] = useState('');
  const [creatingExpense, setCreatingExpense] = useState(false);

  // Settlement Modal State
  const [showSettleModal, setShowSettleModal] = useState(false);
  const [settleSender, setSettleSender] = useState('');
  const [settleReceiver, setSettleReceiver] = useState('');
  const [settleAmount, setSettleAmount] = useState('');
  const [settling, setSettling] = useState(false);
  const [settleError, setSettleError] = useState('');

  const fetchGroupDetails = async () => {
    try {
      const res = await groupService.getGroupDetails(groupId);
      if (res.success) {
        setGroup(res.data);
        // Defaults for expense modal
        setExpensePayer(user.id);
        
        // Initialize equal split state to true (checked) for all members
        const initialSplits = {};
        res.data.members.forEach(m => {
          initialSplits[m.userId] = '';
        });
        setExpenseSplits(initialSplits);
        
        // Default settlement states
        setSettleSender(res.data.members[0]?.userId || '');
        setSettleReceiver(res.data.members[1]?.userId || '');
      } else {
        setError(res.message);
      }
    } catch (err) {
      setError('Access Denied: You are not a member of this group or it does not exist.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGroupDetails();
  }, [groupId]);

  // Add Member
  const handleAddMember = async (e) => {
    e.preventDefault();
    setMemberError('');
    if (!newMemberEmail || newMemberEmail.trim() === '') {
      setMemberError('Email is required');
      return;
    }

    setAddingMember(true);
    try {
      const res = await groupService.addMember(groupId, newMemberEmail);
      if (res.success) {
        setNewMemberEmail('');
        fetchGroupDetails(); // Refresh
      } else {
        setMemberError(res.message);
      }
    } catch (err) {
      setMemberError(err.message || 'Failed to add member');
    } finally {
      setAddingMember(false);
    }
  };

  // Remove Member
  const handleRemoveMember = async (userIdToRemove) => {
    if (!window.confirm("Are you sure you want to remove this member?")) return;
    try {
      const res = await groupService.removeMember(groupId, userIdToRemove);
      if (res.success) {
        fetchGroupDetails();
      } else {
        alert(res.message);
      }
    } catch (err) {
      alert(err.message || 'Failed to remove member');
    }
  };

  // Delete Expense
  const handleDeleteExpense = async (expenseId) => {
    if (!window.confirm("Are you sure you want to delete this expense?")) return;
    try {
      const res = await expenseService.deleteExpense(expenseId);
      if (res.success) {
        fetchGroupDetails();
      } else {
        alert(res.message);
      }
    } catch (err) {
      alert(err.message || 'Failed to delete expense');
    }
  };

  // Create Expense Submit
  const handleCreateExpense = async (e) => {
    e.preventDefault();
    setExpenseError('');

    if (!expenseDesc || expenseDesc.trim() === '') {
      setExpenseError('Please enter a description');
      return;
    }
    const amt = Number(expenseAmount);
    if (isNaN(amt) || amt <= 0) {
      setExpenseError('Please enter a valid amount');
      return;
    }

    // Process Splits inputs
    let splitsPayload = [];

    if (expenseSplitType === 'EQUAL') {
      // In EQUAL splits, expenseSplits is a dictionary of { userId: boolean }
      // Get all checked userIds
      const checkedUserIds = Object.keys(expenseSplits).filter(uid => expenseSplits[uid] === true || expenseSplits[uid] === '');
      if (checkedUserIds.length === 0) {
        setExpenseError('Please select at least one member to split with');
        return;
      }
      splitsPayload = checkedUserIds;
    } else {
      // UNEQUAL, PERCENTAGE, SHARE
      let sum = 0;
      const members = group.members;

      for (const m of members) {
        const val = Number(expenseSplits[m.userId] || 0);
        if (val < 0) {
          setExpenseError('Split values cannot be negative');
          return;
        }
        sum += val;
        splitsPayload.push({
          userId: m.userId,
          splitValue: val
        });
      }

      // Validations
      if (expenseSplitType === 'UNEQUAL') {
        if (Math.abs(sum - amt) > 0.01) {
          setExpenseError(`Sum of splits (₹${sum}) must equal total amount (₹${amt})`);
          return;
        }
      } else if (expenseSplitType === 'PERCENTAGE') {
        if (Math.abs(sum - 100) > 0.01) {
          setExpenseError(`Sum of percentages must equal 100% (got ${sum}%)`);
          return;
        }
      } else if (expenseSplitType === 'SHARE') {
        if (sum <= 0) {
          setExpenseError('Total share multipliers must be greater than 0');
          return;
        }
      }
    }

    setCreatingExpense(true);
    try {
      const res = await expenseService.createExpense({
        groupId,
        description: expenseDesc,
        amount: amt,
        paidById: expensePayer,
        splitType: expenseSplitType,
        splits: splitsPayload
      });

      if (res.success) {
        setShowExpenseModal(false);
        setExpenseDesc('');
        setExpenseAmount('');
        fetchGroupDetails();
      } else {
        setExpenseError(res.message);
      }
    } catch (err) {
      setExpenseError(err.message || 'Failed to create expense');
    } finally {
      setCreatingExpense(false);
    }
  };

  // Record Settlement Submit
  const handleRecordSettlement = async (e) => {
    e.preventDefault();
    setSettleError('');

    if (settleSender === settleReceiver) {
      setSettleError('Sender and receiver must be different');
      return;
    }
    const amt = Number(settleAmount);
    if (isNaN(amt) || amt <= 0) {
      setSettleError('Please enter a valid amount');
      return;
    }

    setSettling(true);
    try {
      const res = await settlementService.createSettlement({
        groupId,
        senderId: settleSender,
        receiverId: settleReceiver,
        amount: amt
      });

      if (res.success) {
        setShowSettleModal(false);
        setSettleAmount('');
        fetchGroupDetails();
      } else {
        setSettleError(res.message);
      }
    } catch (err) {
      setSettleError(err.message || 'Failed to record settlement');
    } finally {
      setSettling(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent"></div>
          <p className="text-sm font-medium text-slate-500">Loading group details...</p>
        </div>
      </div>
    );
  }

  if (error || !group) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
            <AlertCircle className="h-6 w-6" />
          </div>
          <h3 className="text-lg font-bold text-slate-900">An Error Occurred</h3>
          <p className="text-sm text-slate-500">{error || 'Group not found'}</p>
          <button
            onClick={() => navigate('/dashboard')}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 transition-all"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const isCreator = group.creator.id === user.id;
  const userBalanceObj = group.balances.find(b => b.userId === user.id);
  const userNetBalance = userBalanceObj ? userBalanceObj.netBalance : 0;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-16">
      {/* Top Header Panel */}
      <div className="bg-white border-b border-slate-200/80 sticky top-0 z-10 shadow-sm">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/dashboard')}
              className="p-2 rounded-xl hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-all"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">{group.name}</h1>
                <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 border border-emerald-100">
                  Group ID: {group.id.substring(0, 8)}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Created by {isCreator ? 'You' : group.creator.name} ({group.creator.email})
              </p>
            </div>
          </div>
          
          <div className="flex gap-2 w-full sm:w-auto">
            <button
              onClick={() => setShowSettleModal(true)}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-all"
            >
              <ArrowRightLeft className="h-4 w-4 text-slate-400" />
              Settle Debt
            </button>
            <button
              onClick={() => {
                // Reset splits checklist and open modal
                const initialSplits = {};
                group.members.forEach(m => {
                  initialSplits[m.userId] = true;
                });
                setExpenseSplits(initialSplits);
                setExpenseError('');
                setShowExpenseModal(true);
              }}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-emerald-600/10 transition-all"
            >
              <Plus className="h-4 w-4" />
              Add Expense
            </button>
          </div>
        </div>
      </div>

      {/* Main Grid Content */}
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 grid gap-8 md:grid-cols-3">
        
        {/* Left Hand: Members and Balances */}
        <div className="md:col-span-1 space-y-8">
          
          {/* Your Standing Banner */}
          <div className={`rounded-2xl p-5 border shadow-sm ${
            userNetBalance > 0 
              ? 'bg-emerald-50/50 border-emerald-100 text-emerald-800' 
              : userNetBalance < 0 
                ? 'bg-rose-50/50 border-rose-100 text-rose-800' 
                : 'bg-slate-50 border-slate-200 text-slate-600'
          }`}>
            <p className="text-xs font-semibold uppercase tracking-wider opacity-80">Your balance in group</p>
            <h3 className="text-2xl font-extrabold mt-1">
              {userNetBalance > 0 ? `You are owed ₹${userNetBalance}` : userNetBalance < 0 ? `You owe ₹${Math.abs(userNetBalance)}` : 'You are all settled up'}
            </h3>
          </div>

          {/* Members List Box */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="border-b border-slate-200/80 px-5 py-4 bg-slate-50/50">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <Users className="h-4 w-4 text-slate-400" />
                Group Members ({group.members.length})
              </h3>
            </div>

            <div className="p-4 divide-y divide-slate-100 max-h-60 overflow-y-auto">
              {group.members.map(member => (
                <div key={member.userId} className="flex justify-between items-center py-3 first:pt-0 last:pb-0">
                  <div>
                    <p className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                      {member.name} 
                      {member.userId === user.id && <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">You</span>}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">{member.email}</p>
                  </div>
                  {isCreator && member.userId !== group.creator.id && (
                    <button
                      onClick={() => handleRemoveMember(member.userId)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all"
                      title="Remove Member"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Add Member form (Creator Only) */}
            {isCreator && (
              <div className="border-t border-slate-100 p-4 bg-slate-50/20">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Add Member</h4>
                <form onSubmit={handleAddMember} className="flex gap-2">
                  <input
                    type="email"
                    required
                    placeholder="friend@email.com"
                    value={newMemberEmail}
                    onChange={(e) => {
                      setNewMemberEmail(e.target.value);
                      setMemberError('');
                    }}
                    className="block w-full rounded-lg border border-slate-200 bg-white py-1.5 px-3 text-xs text-slate-900 focus:border-emerald-500 focus:outline-none transition-all"
                  />
                  <button
                    type="submit"
                    disabled={addingMember}
                    className="rounded-lg bg-slate-800 hover:bg-slate-700 px-3 py-1.5 text-xs font-semibold text-white disabled:bg-slate-400 transition-all flex items-center gap-1"
                  >
                    {addingMember ? 'Adding...' : 'Add'}
                  </button>
                </form>
                {memberError && <p className="text-[11px] font-semibold text-rose-600 mt-1.5">{memberError}</p>}
              </div>
            )}
          </div>

          {/* Group Balances standing summary */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="border-b border-slate-200/80 px-5 py-4 bg-slate-50/50">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <Landmark className="h-4 w-4 text-slate-400" />
                Group Balances
              </h3>
            </div>
            <div className="p-4 divide-y divide-slate-100">
              {group.balances.map(bal => (
                <div key={bal.userId} className="flex justify-between items-center py-3 first:pt-0 last:pb-0 text-sm">
                  <span className="font-medium text-slate-700">{bal.name}</span>
                  <span className={`font-bold ${bal.netBalance > 0 ? 'text-emerald-600' : bal.netBalance < 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                    {bal.netBalance > 0 ? `+₹${bal.netBalance}` : bal.netBalance < 0 ? `-₹${Math.abs(bal.netBalance)}` : '₹0.00'}
                  </span>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Right Hand / Middle: Expenses List */}
        <div className="md:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="border-b border-slate-200/80 px-6 py-4 bg-slate-50/50 flex justify-between items-center">
              <h3 className="font-bold text-slate-950">Expense Log</h3>
            </div>

            {group.expenses.length === 0 ? (
              <div className="text-center py-20 px-4">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
                  <Landmark className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-sm font-semibold text-slate-900">No expenses recorded</h3>
                <p className="mt-1 text-sm text-slate-500">Create an expense to split costs with the group</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {group.expenses.map(expense => (
                  <div
                    key={expense.id}
                    className="p-6 hover:bg-slate-50/30 transition-all flex items-center justify-between group cursor-pointer"
                    onClick={(e) => {
                      // Prevent trigger if clicking on delete trash button
                      if (e.target.closest('.delete-btn')) return;
                      navigate(`/expense/${expense.id}`);
                    }}
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex h-11 w-11 flex-col items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                        <span className="text-[10px] font-extrabold uppercase">
                          {new Date(expense.createdAt).toLocaleString('default', { month: 'short' })}
                        </span>
                        <span className="text-base font-black leading-none">
                          {new Date(expense.createdAt).getDate()}
                        </span>
                      </div>
                      
                      <div>
                        <h4 className="font-bold text-slate-900 group-hover:text-emerald-700 transition-colors">
                          {expense.description}
                        </h4>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Paid by <span className="font-semibold text-slate-600">{expense.paidBy.id === user.id ? 'You' : expense.paidBy.name}</span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-xs text-slate-400 font-medium">Total Spent</p>
                        <p className="text-sm font-extrabold text-slate-900">₹{expense.amount}</p>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          className="delete-btn p-2 rounded-lg text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition-all"
                          onClick={() => handleDeleteExpense(expense.id)}
                          title="Delete Expense"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                        <span className="p-2 rounded-lg text-slate-400 group-hover:text-slate-800 transition-colors">
                          <MessageSquare className="h-4 w-4" />
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Add Expense Modal Overlay */}
      {showExpenseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-lg bg-white rounded-2xl border border-slate-200/80 shadow-2xl p-6 relative animate-in fade-in-50 zoom-in-95 duration-200 my-8">
            <h3 className="text-lg font-bold text-slate-900 mb-4">Add Expense</h3>
            
            <form onSubmit={handleCreateExpense} className="space-y-4">
              {expenseError && (
                <div className="rounded-lg bg-red-50 p-3 text-sm font-medium text-red-600 border border-red-100">
                  {expenseError}
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Dinner, Groceries"
                    value={expenseDesc}
                    onChange={(e) => setExpenseDesc(e.target.value)}
                    className="block w-full rounded-xl border border-slate-200 bg-white py-2.5 px-3 text-slate-900 focus:border-emerald-500 focus:outline-none sm:text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Amount (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="0.00"
                    value={expenseAmount}
                    onChange={(e) => setExpenseAmount(e.target.value)}
                    className="block w-full rounded-xl border border-slate-200 bg-white py-2.5 px-3 text-slate-900 focus:border-emerald-500 focus:outline-none sm:text-sm"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Paid By</label>
                  <select
                    value={expensePayer}
                    onChange={(e) => setExpensePayer(e.target.value)}
                    className="block w-full rounded-xl border border-slate-200 bg-white py-2.5 px-3 text-slate-900 focus:border-emerald-500 focus:outline-none sm:text-sm"
                  >
                    {group.members.map(m => (
                      <option key={m.userId} value={m.userId}>{m.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Split Type</label>
                  <select
                    value={expenseSplitType}
                    onChange={(e) => {
                      setExpenseSplitType(e.target.value);
                      // Clear splits dictionary when type changes
                      const clearedSplits = {};
                      group.members.forEach(m => {
                        clearedSplits[m.userId] = e.target.value === 'EQUAL' ? true : '';
                      });
                      setExpenseSplits(clearedSplits);
                    }}
                    className="block w-full rounded-xl border border-slate-200 bg-white py-2.5 px-3 text-slate-900 focus:border-emerald-500 focus:outline-none sm:text-sm"
                  >
                    <option value="EQUAL">Split Equally</option>
                    <option value="UNEQUAL">Unequal exact amount</option>
                    <option value="PERCENTAGE">Percentage split</option>
                    <option value="SHARE">Shares multipliers</option>
                  </select>
                </div>
              </div>

              {/* Splits List Inputs */}
              <div className="border-t border-slate-100 pt-4">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                  Split shares breakdown
                </h4>
                
                <div className="space-y-3 max-h-48 overflow-y-auto pr-1">
                  {group.members.map(member => (
                    <div key={member.userId} className="flex items-center justify-between text-sm py-1">
                      <span className="font-medium text-slate-700">{member.name}</span>
                      
                      {expenseSplitType === 'EQUAL' ? (
                        <input
                          type="checkbox"
                          checked={expenseSplits[member.userId] === true}
                          onChange={(e) => {
                            setExpenseSplits({
                              ...expenseSplits,
                              [member.userId]: e.target.checked
                            });
                          }}
                          className="h-4.5 w-4.5 rounded text-emerald-600 focus:ring-emerald-500"
                        />
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            step="any"
                            placeholder={expenseSplitType === 'UNEQUAL' ? '0.00' : expenseSplitType === 'PERCENTAGE' ? '0' : '1'}
                            value={expenseSplits[member.userId] || ''}
                            onChange={(e) => {
                              setExpenseSplits({
                                ...expenseSplits,
                                [member.userId]: e.target.value
                              });
                            }}
                            className="w-24 rounded-lg border border-slate-200 bg-white py-1 px-2.5 text-right text-slate-900 focus:border-emerald-500 focus:outline-none sm:text-xs"
                          />
                          <span className="text-xs text-slate-400 font-semibold w-6">
                            {expenseSplitType === 'UNEQUAL' ? '₹' : expenseSplitType === 'PERCENTAGE' ? '%' : 'sh'}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowExpenseModal(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingExpense}
                  className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:bg-emerald-400 shadow-md shadow-emerald-600/10 transition-all"
                >
                  {creatingExpense ? 'Saving...' : 'Add Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Record Settlement Modal Overlay */}
      {showSettleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200/80 shadow-2xl p-6 relative animate-in fade-in-50 zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-slate-900 mb-4">Record Settlement</h3>
            
            <form onSubmit={handleRecordSettlement} className="space-y-4">
              {settleError && (
                <div className="rounded-lg bg-red-50 p-3 text-sm font-medium text-red-600 border border-red-100">
                  {settleError}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Paid By (Sender)</label>
                <select
                  value={settleSender}
                  onChange={(e) => setSettleSender(e.target.value)}
                  className="block w-full rounded-xl border border-slate-200 bg-white py-2.5 px-3 text-slate-900 focus:border-emerald-500 focus:outline-none sm:text-sm"
                >
                  {group.members.map(m => (
                    <option key={m.userId} value={m.userId}>{m.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Paid To (Receiver)</label>
                <select
                  value={settleReceiver}
                  onChange={(e) => setSettleReceiver(e.target.value)}
                  className="block w-full rounded-xl border border-slate-200 bg-white py-2.5 px-3 text-slate-900 focus:border-emerald-500 focus:outline-none sm:text-sm"
                >
                  {group.members.map(m => (
                    <option key={m.userId} value={m.userId}>{m.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Amount (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="0.00"
                  value={settleAmount}
                  onChange={(e) => setSettleAmount(e.target.value)}
                  className="block w-full rounded-xl border border-slate-200 bg-white py-2.5 px-3 text-slate-900 focus:border-emerald-500 focus:outline-none sm:text-sm"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSettleModal(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={settling}
                  className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:bg-emerald-400 shadow-md shadow-emerald-600/10 transition-all"
                >
                  {settling ? 'Recording...' : 'Record Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default GroupDetails;
