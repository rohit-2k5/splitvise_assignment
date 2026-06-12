const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// Create helper to get headers dynamically
const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
};

const handleResponse = async (res) => {
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || 'Something went wrong');
  }
  return data;
};

// API Services wrapper using native fetch (or axios-like interface)
// We will implement native fetch wrappers which are lightweight, robust, and require no extra node resolver overhead.
export const api = {
  get: async (path) => {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      method: 'GET',
      headers: getAuthHeaders()
    });
    return handleResponse(res);
  },
  post: async (path, body) => {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(body)
    });
    return handleResponse(res);
  },
  delete: async (path) => {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    return handleResponse(res);
  }
};

// Auth Service Endpoints
export const authService = {
  register: (name, email, password) => api.post('/auth/register', { name, email, password }),
  login: (email, password) => api.post('/auth/login', { email, password }),
  getCurrentUser: () => api.get('/auth/me'),
};

// Group Service Endpoints
export const groupService = {
  createGroup: (name) => api.post('/groups', { name }),
  listGroups: () => api.get('/groups'),
  getGroupDetails: (id) => api.get(`/groups/${id}`),
  addMember: (groupId, email) => api.post(`/groups/${groupId}/members`, { email }),
  removeMember: (groupId, userId) => api.delete(`/groups/${groupId}/members/${userId}`),
};

// Expense Service Endpoints
export const expenseService = {
  createExpense: (expenseData) => api.post('/expenses', expenseData),
  getExpenseDetails: (id) => api.get(`/expenses/${id}`),
  deleteExpense: (id) => api.delete(`/expenses/${id}`),
};

// Settlement Service Endpoints
export const settlementService = {
  createSettlement: (settlementData) => api.post('/settlements', settlementData),
  getGroupSettlements: (groupId) => api.get(`/settlements/group/${groupId}`),
};

// Message Service Endpoints
export const messageService = {
  getExpenseMessages: (expenseId) => api.get(`/messages/expense/${expenseId}`),
};
