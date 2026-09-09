import { useState, useEffect } from 'react';
import api from '../api';

function Section({ title, children }) {
  return (
    <section className="bg-white rounded-lg shadow p-6 mb-6">
      <h2 className="text-lg font-semibold text-gray-800 mb-4">{title}</h2>
      {children}
    </section>
  );
}

function Table({ columns, rows, emptyMsg = 'No data' }) {
  if (!rows.length) return <p className="text-sm text-gray-400">{emptyMsg}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200">
            {columns.map(c => <th key={c.key} className="text-left py-2 px-3 font-medium text-gray-600">{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.id || i} className="border-b border-gray-100 hover:bg-gray-50">
              {columns.map(c => <td key={c.key} className="py-2 px-3">{c.render ? c.render(row) : row[c.key]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function TenantDashboard() {
  const [leases, setLeases] = useState([]);
  const [payments, setPayments] = useState([]);
  const [selectedLease, setSelectedLease] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showTicketForm, setShowTicketForm] = useState(false);
  const [ticketForm, setTicketForm] = useState({ unit_id: '', description: '', priority: 'medium' });

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/leases', { params: { limit: 50 } });
      setLeases(data.data);
      const active = data.data.find(l => l.status === 'active');
      if (active) {
        setSelectedLease(active);
        const { data: pay } = await api.get(`/payments/${active.id}`, { params: { limit: 50 } });
        setPayments(pay.data);
        const { data: maint } = await api.get(`/maintenance/${active.unit_id}`);
        setTickets(maint);
        setTicketForm({ unit_id: active.unit_id, description: '', priority: 'medium' });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleMarkPaid = async (paymentId) => {
    try {
      await api.patch(`/payments/${paymentId}/mark-paid`);
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed');
    }
  };

  const handleCreateTicket = async (e) => {
    e.preventDefault();
    try {
      await api.post('/maintenance', ticketForm);
      setTicketForm({ unit_id: selectedLease?.unit_id || '', description: '', priority: 'medium' });
      setShowTicketForm(false);
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed');
    }
  };

  if (loading) return <div className="text-center py-12 text-gray-400">Loading dashboard...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Tenant Dashboard</h1>

      {/* Active Lease */}
      <Section title="My Active Lease">
        {selectedLease ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <span className="text-xs text-gray-500">Property</span>
              <p className="font-medium">{selectedLease.property_name}</p>
            </div>
            <div>
              <span className="text-xs text-gray-500">Unit</span>
              <p className="font-medium">{selectedLease.unit_number}</p>
            </div>
            <div>
              <span className="text-xs text-gray-500">Monthly Rent</span>
              <p className="font-medium">₹{Number(selectedLease.monthly_rent).toLocaleString()}</p>
            </div>
            <div>
              <span className="text-xs text-gray-500">Period</span>
              <p className="font-medium">{selectedLease.start_date} to {selectedLease.end_date}</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-400">No active lease found</p>
        )}
      </Section>

      {/* Payment History */}
      <Section title="Payment History">
        <Table
          columns={[
            { key: 'amount', label: 'Amount', render: r => `₹${Number(r.amount).toLocaleString()}` },
            { key: 'due_date', label: 'Due Date' },
            { key: 'paid_date', label: 'Paid Date', render: r => r.paid_date || '—' },
            { key: 'status', label: 'Status', render: r => {
              const colors = { paid: 'text-green-600', pending: 'text-yellow-600', overdue: 'text-red-600' };
              return <span className={colors[r.status] || ''}>{r.status}</span>;
            }},
            { key: 'late_fee_applied', label: 'Late Fee', render: r => r.late_fee_applied > 0 ? `₹${r.late_fee_applied}` : '—' },
            { key: '_actions', label: '', render: (r) => (
              r.status !== 'paid' ? (
                <button onClick={() => handleMarkPaid(r.id)} className="text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700">
                  Mark Paid
                </button>
              ) : null
            )},
          ]}
          rows={payments}
          emptyMsg="No payment records"
        />
      </Section>

      {/* Maintenance Tickets */}
      <Section title="Maintenance Requests">
        <div className="flex justify-end mb-4">
          <button onClick={() => setShowTicketForm(!showTicketForm)} className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700">
            + New Ticket
          </button>
        </div>
        {showTicketForm && (
          <form onSubmit={handleCreateTicket} className="grid grid-cols-1 gap-3 mb-4 p-4 bg-gray-50 rounded">
            <textarea placeholder="Describe the issue..." value={ticketForm.description} onChange={e => setTicketForm({...ticketForm, description: e.target.value})} required rows={3}
              className="border rounded px-3 py-2 text-sm" />
            <div className="flex gap-3">
              <select value={ticketForm.priority} onChange={e => setTicketForm({...ticketForm, priority: e.target.value})}
                className="border rounded px-3 py-2 text-sm">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
              <button type="submit" className="bg-green-600 text-white px-4 py-1.5 rounded text-sm hover:bg-green-700">Submit</button>
              <button type="button" onClick={() => setShowTicketForm(false)} className="text-gray-500 text-sm">Cancel</button>
            </div>
          </form>
        )}
        <Table
          columns={[
            { key: 'description', label: 'Issue' },
            { key: 'priority', label: 'Priority', render: r => {
              const colors = { low: 'bg-gray-100', medium: 'bg-yellow-100 text-yellow-800', high: 'bg-orange-100 text-orange-800', urgent: 'bg-red-100 text-red-800' };
              return <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[r.priority] || ''}`}>{r.priority}</span>;
            }},
            { key: 'status', label: 'Status', render: r => {
              const colors = { open: 'text-red-600', in_progress: 'text-yellow-600', resolved: 'text-green-600' };
              return <span className={colors[r.status] || ''}>{r.status.replace('_', ' ')}</span>;
            }},
            { key: 'created_at', label: 'Created', render: r => new Date(r.created_at).toLocaleDateString() },
          ]}
          rows={tickets}
          emptyMsg="No maintenance requests"
        />
      </Section>
    </div>
  );
}
