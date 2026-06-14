import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { expenseService, messageService } from '../services/api';
import { io } from 'socket.io-client';
import { ArrowLeft, Send, MessageSquare, Shield, Clock, Calendar, CheckCircle, SplitSquareVertical } from 'lucide-react';

const ExpenseDetails = () => {
  const { id: expenseId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [expense, setExpense] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const socketRef = useRef(null);
  const chatBottomRef = useRef(null);

  const fetchExpenseAndChat = async () => {
    try {
      setLoading(true); setError('');
      const expRes = await expenseService.getExpenseDetails(expenseId);
      if (expRes.success) setExpense(expRes.data);
      else { setError(expRes.message); return; }
      const msgRes = await messageService.getExpenseMessages(expenseId);
      if (msgRes.success) setMessages(msgRes.data);
    } catch { setError('Access Denied: You do not have access to this expense.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchExpenseAndChat(); }, [expenseId]);

  useEffect(() => {
    if (loading || error || !expense) return;
    const socketUrl = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';
    socketRef.current = io(socketUrl);
    socketRef.current.emit('join_room', { expenseId });
    socketRef.current.on('receive_message', (msg) => {
      setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
    });
    return () => { if (socketRef.current) { socketRef.current.emit('leave_room', { expenseId }); socketRef.current.disconnect(); } };
  }, [expense, loading, error]);

  useEffect(() => { chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!chatInput.trim() || !socketRef.current) return;
    socketRef.current.emit('send_message', { expenseId, senderId: user.id, messageText: chatInput.trim() });
    setChatInput('');
  };

  if (loading) return (
    <div className="flex h-screen w-screen items-center justify-center" style={{ background: 'var(--bg-base)' }}>
      <div className="flex flex-col items-center gap-3">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
        <p className="text-sm text-slate-500">Loading bill details...</p>
      </div>
    </div>
  );

  if (error || !expense) return (
    <div className="flex h-screen w-screen items-center justify-center p-4" style={{ background: 'var(--bg-base)' }}>
      <div className="max-w-md w-full text-center space-y-4">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10"><Clock className="h-6 w-6 text-red-400" /></div>
        <h3 className="text-lg font-bold text-white">Error</h3>
        <p className="text-sm text-slate-500">{error || 'Expense not found'}</p>
        <button onClick={() => navigate('/dashboard')} className="btn-ghost flex items-center gap-2 mx-auto px-4 py-2 text-sm">
          <ArrowLeft className="h-4 w-4" /> Dashboard
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen pb-12" style={{ background: 'var(--bg-base)' }}>
      {/* Header */}
      <div className="navbar sticky top-0 z-10">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate(`/group/${expense.group.id}`)} className="btn-ghost p-2">
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <h1 className="text-lg font-bold text-white">{expense.description}</h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Group: <span className="text-brand-400 cursor-pointer hover:underline" onClick={() => navigate(`/group/${expense.group.id}`)}>{expense.group.name}</span>
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-500">Total Bill</p>
            <p className="text-xl font-black text-white">₹{expense.amount}</p>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 grid gap-6 md:grid-cols-3">
        {/* Left: Details + Splits */}
        <div className="md:col-span-1 space-y-5">
          {/* Bill Meta */}
          <div className="glass-card p-5 space-y-4">
            <h3 className="font-bold text-white border-b pb-3" style={{ borderColor: 'var(--border)' }}>Bill Details</h3>
            {[
              { icon: Shield, label: 'Paid By', value: expense.paidBy.id === user.id ? 'You' : expense.paidBy.name, color: 'text-brand-400' },
              { icon: Calendar, label: 'Recorded On', value: new Date(expense.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }), color: 'text-slate-300' },
              { icon: CheckCircle, label: 'Split Type', value: expense.splits[0]?.splitType || 'EQUAL', color: 'text-slate-300' },
            ].map(({ icon: Icon, label, value, color }) => (
              <div key={label} className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-600 flex-shrink-0">
                  <Icon className="h-4 w-4 text-slate-400" />
                </div>
                <div>
                  <p className="text-xs text-slate-500">{label}</p>
                  <p className={`text-sm font-semibold ${color} mt-0.5`}>{value}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Splits */}
          <div className="glass-card overflow-hidden">
            <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <h3 className="font-bold text-white flex items-center gap-2">
                <SplitSquareVertical className="h-4 w-4 text-brand-500" /> Split Breakdown
              </h3>
            </div>
            <div className="p-4 divide-y" style={{ '--tw-divide-opacity': 1 }}>
              {expense.splits.map(split => (
                <div key={split.id} className="flex justify-between items-center py-3 first:pt-0 last:pb-0">
                  <div>
                    <p className="text-sm font-semibold text-white">{split.userName}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {split.splitType === 'PERCENTAGE' ? `${split.splitValue}% share` : split.splitType === 'SHARE' ? `${split.splitValue} shares` : 'Equal split'}
                    </p>
                  </div>
                  <span className="text-sm font-black amount-positive">₹{split.amount}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Chat */}
        <div className="md:col-span-2">
          <div className="glass-card overflow-hidden flex flex-col" style={{ height: '520px' }}>
            {/* Chat Header */}
            <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
              <h3 className="font-bold text-white flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-brand-500" /> Expense Discussion
              </h3>
              <span className="flex items-center gap-1.5 badge-green">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-400 animate-pulse" /> Live
              </span>
            </div>

            {/* Messages */}
            <div className="flex-1 p-5 overflow-y-auto space-y-3" style={{ background: 'var(--bg-base)' }}>
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-2 text-slate-600">
                  <MessageSquare className="h-8 w-8 stroke-[1.5]" />
                  <p className="text-sm">No messages yet. Start the conversation!</p>
                </div>
              ) : messages.map(msg => {
                const isMe = msg.sender.id === user.id;
                return (
                  <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className="text-[10px] font-bold text-slate-500">{msg.sender.name}</span>
                      <span className="text-[9px] text-slate-600">{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <div className={`max-w-xs md:max-w-sm rounded-2xl px-4 py-2.5 text-sm ${isMe ? 'gradient-brand text-surface-900 font-medium rounded-tr-none' : 'text-slate-200 rounded-tl-none'}`}
                      style={isMe ? {} : { background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                      {msg.messageText}
                    </div>
                  </div>
                );
              })}
              <div ref={chatBottomRef} />
            </div>

            {/* Input */}
            <form onSubmit={handleSendMessage} className="p-4 border-t flex gap-3" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
              <input
                type="text"
                placeholder="Type a message..."
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                className="input-dark flex-1"
              />
              <button type="submit" className="btn-brand flex h-10 w-10 items-center justify-center p-0 rounded-xl flex-shrink-0">
                <Send className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
};

export default ExpenseDetails;
