import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
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

export default function OwnerDashboard() {
  const [properties, setProperties] = useState([]);
  const [leases, setLeases] = useState([]);
  const [leaseMeta, setLeaseMeta] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [occupancy, setOccupancy] = useState([]);
  const [revenue, setRevenue] = useState([]);
  const [runningTotal, setRunningTotal] = useState([]);
  const [unitMap, setUnitMap] = useState({});
  const [selectedProperty, setSelectedProperty] = useState(null);
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showPropForm, setShowPropForm] = useState(false);
  const [propForm, setPropForm] = useState({ name: '', address: '', city: '' });

  const [showUnitForm, setShowUnitForm] = useState(false);
  const [unitForm, setUnitForm] = useState({ unit_number: '', rent_amount: '', bedrooms: 1 });

  const [showLeaseForm, setShowLeaseForm] = useState(false);
  const [leaseForm, setLeaseForm] = useState({ unit_id: '', tenant_id: '', start_date: '', end_date: '', monthly_rent: '', security_deposit: '' });
  const [tenants, setTenants] = useState([]);
  const [leaseUnits, setLeaseUnits] = useState([]);

  const loadLeases = async (page = 1) => {
    try {
      const { data } = await api.get('/leases', { params: { page, limit: leaseMeta.limit } });
      setLeases(data.data);
      setLeaseMeta(data);
    } catch (err) {
      console.error(err);
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const [p, o, r, rt] = await Promise.all([
        api.get('/properties'),
        api.get('/reports/occupancy'),
        api.get('/reports/revenue'),
        api.get('/reports/running-total'),
      ]);
      setProperties(p.data);
      setOccupancy(o.data);
      setRevenue(r.data);
      setRunningTotal(rt.data);

      const uMap = {};
      for (const prop of p.data) {
        const u = await api.get(`/units/${prop.id}`);
        uMap[prop.id] = u.data;
      }
      setUnitMap(uMap);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
    loadLeases(1);
  };

  useEffect(() => { load(); }, []);

  const loadUnits = async (propId) => {
    setSelectedProperty(propId);
    try {
      const { data } = await api.get(`/units/${propId}`);
      setUnits(data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateProperty = async (e) => {
    e.preventDefault();
    try {
      await api.post('/properties', propForm);
      setPropForm({ name: '', address: '', city: '' });
      setShowPropForm(false);
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed');
    }
  };

  const handleCreateUnit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/units', { property_id: selectedProperty, ...unitForm, bedrooms: Number(unitForm.bedrooms) });
      setUnitForm({ unit_number: '', rent_amount: '', bedrooms: 1 });
      setShowUnitForm(false);
      loadUnits(selectedProperty);
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed');
    }
  };

  const loadLeaseOptions = async () => {
    try {
      const { data } = await api.get('/users', { params: { role: 'tenant' } });
      setTenants(data.data);

      const unitsWithProperty = [];
      for (const prop of properties) {
        const propUnits = unitMap[prop.id] || [];
        for (const u of propUnits) {
          unitsWithProperty.push({ ...u, property_name: prop.name });
        }
      }
      setLeaseUnits(unitsWithProperty);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateLease = async (e) => {
    e.preventDefault();
    try {
      await api.post('/leases', {
        ...leaseForm,
        monthly_rent: Number(leaseForm.monthly_rent),
        security_deposit: Number(leaseForm.security_deposit || 0),
      });
      setLeaseForm({ unit_id: '', tenant_id: '', start_date: '', end_date: '', monthly_rent: '', security_deposit: '' });
      setShowLeaseForm(false);
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed');
    }
  };

  const openLeaseForm = () => {
    setShowLeaseForm(true);
    loadLeaseOptions();
  };

  if (loading) return <div className="text-center py-12 text-gray-400">Loading dashboard...</div>;

  const chartData = runningTotal.map(r => ({
    month: r.month?.slice(0, 7),
    revenue: Number(r.revenue_collected),
    running_total: Number(r.running_total),
  }));

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Owner Dashboard</h1>

      {/* Properties */}
      <Section title="Properties">
        <div className="flex justify-between items-center mb-4">
          <span className="text-sm text-gray-500">{properties.length} properties</span>
          <button onClick={() => setShowPropForm(!showPropForm)} className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700">
            + Add Property
          </button>
        </div>
        {showPropForm && (
          <form onSubmit={handleCreateProperty} className="grid grid-cols-3 gap-3 mb-4 p-4 bg-gray-50 rounded">
            <input placeholder="Name" value={propForm.name} onChange={e => setPropForm({...propForm, name: e.target.value})} required className="border rounded px-3 py-2 text-sm" />
            <input placeholder="Address" value={propForm.address} onChange={e => setPropForm({...propForm, address: e.target.value})} required className="border rounded px-3 py-2 text-sm" />
            <input placeholder="City" value={propForm.city} onChange={e => setPropForm({...propForm, city: e.target.value})} required className="border rounded px-3 py-2 text-sm" />
            <div className="col-span-3 flex gap-2">
              <button type="submit" className="bg-green-600 text-white px-4 py-1.5 rounded text-sm hover:bg-green-700">Save</button>
              <button type="button" onClick={() => setShowPropForm(false)} className="text-gray-500 text-sm">Cancel</button>
            </div>
          </form>
        )}
        <Table
          columns={[
            { key: 'name', label: 'Name' },
            { key: 'address', label: 'Address' },
            { key: 'city', label: 'City' },
            { key: 'id', label: 'Units', render: (row) => {
              const u = unitMap[row.id];
              return u ? u.length : '—';
            }},
            { key: '_actions', label: '', render: (row) => (
              <button onClick={() => loadUnits(row.id)} className="text-blue-600 text-xs hover:underline">View Units</button>
            )},
          ]}
          rows={properties}
        />
      </Section>

      {/* Units */}
      {selectedProperty && (
        <Section title={`Units — ${properties.find(p => p.id === selectedProperty)?.name || ''}`}>
          <div className="flex justify-end mb-4">
            <button onClick={() => setShowUnitForm(!showUnitForm)} className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700">
              + Add Unit
            </button>
          </div>
          {showUnitForm && (
            <form onSubmit={handleCreateUnit} className="grid grid-cols-3 gap-3 mb-4 p-4 bg-gray-50 rounded">
              <input placeholder="Unit Number" value={unitForm.unit_number} onChange={e => setUnitForm({...unitForm, unit_number: e.target.value})} required className="border rounded px-3 py-2 text-sm" />
              <input placeholder="Rent Amount" type="number" value={unitForm.rent_amount} onChange={e => setUnitForm({...unitForm, rent_amount: e.target.value})} required className="border rounded px-3 py-2 text-sm" />
              <input placeholder="Bedrooms" type="number" value={unitForm.bedrooms} onChange={e => setUnitForm({...unitForm, bedrooms: e.target.value})} className="border rounded px-3 py-2 text-sm" />
              <div className="col-span-3 flex gap-2">
                <button type="submit" className="bg-green-600 text-white px-4 py-1.5 rounded text-sm hover:bg-green-700">Save</button>
                <button type="button" onClick={() => setShowUnitForm(false)} className="text-gray-500 text-sm">Cancel</button>
              </div>
            </form>
          )}
          <Table
            columns={[
              { key: 'unit_number', label: 'Unit' },
              { key: 'rent_amount', label: 'Rent', render: r => `₹${Number(r.rent_amount).toLocaleString()}` },
              { key: 'bedrooms', label: 'Beds' },
              { key: 'status', label: 'Status', render: r => (
                <span className={r.status === 'occupied' ? 'text-orange-600' : 'text-green-600'}>{r.status}</span>
              )},
            ]}
            rows={units}
          />
        </Section>
      )}

      {/* Leases */}
      <Section title="Leases">
        <div className="flex justify-end mb-4">
          <button onClick={openLeaseForm} className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700">
            + Create Lease
          </button>
        </div>
        {showLeaseForm && (
          <form onSubmit={handleCreateLease} className="grid grid-cols-3 gap-3 mb-4 p-4 bg-gray-50 rounded">
            <select value={leaseForm.unit_id} onChange={e => setLeaseForm({...leaseForm, unit_id: e.target.value})} required className="border rounded px-3 py-2 text-sm">
              <option value="">Select Unit</option>
              {leaseUnits.map(u => (
                <option key={u.id} value={u.id}>{u.property_name} — {u.unit_number}</option>
              ))}
            </select>
            <select value={leaseForm.tenant_id} onChange={e => setLeaseForm({...leaseForm, tenant_id: e.target.value})} required className="border rounded px-3 py-2 text-sm">
              <option value="">Select Tenant</option>
              {tenants.map(t => (
                <option key={t.id} value={t.id}>{t.name} ({t.email})</option>
              ))}
            </select>
            <input placeholder="Monthly Rent" type="number" value={leaseForm.monthly_rent} onChange={e => setLeaseForm({...leaseForm, monthly_rent: e.target.value})} required className="border rounded px-3 py-2 text-sm" />
            <div>
              <label className="text-xs text-gray-500">Start Date</label>
              <input type="date" value={leaseForm.start_date} onChange={e => setLeaseForm({...leaseForm, start_date: e.target.value})} required className="w-full border rounded px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-500">End Date</label>
              <input type="date" value={leaseForm.end_date} onChange={e => setLeaseForm({...leaseForm, end_date: e.target.value})} required className="w-full border rounded px-3 py-2 text-sm" />
            </div>
            <input placeholder="Security Deposit" type="number" value={leaseForm.security_deposit} onChange={e => setLeaseForm({...leaseForm, security_deposit: e.target.value})} className="border rounded px-3 py-2 text-sm" />
            <div className="col-span-3 flex gap-2">
              <button type="submit" className="bg-green-600 text-white px-4 py-1.5 rounded text-sm hover:bg-green-700">Save</button>
              <button type="button" onClick={() => setShowLeaseForm(false)} className="text-gray-500 text-sm">Cancel</button>
            </div>
          </form>
        )}
        <Table
          columns={[
            { key: 'property_name', label: 'Property' },
            { key: 'unit_number', label: 'Unit' },
            { key: 'tenant_name', label: 'Tenant' },
            { key: 'monthly_rent', label: 'Rent', render: r => `₹${Number(r.monthly_rent).toLocaleString()}` },
            { key: 'start_date', label: 'Start' },
            { key: 'end_date', label: 'End' },
            { key: 'status', label: 'Status', render: r => (
              <span className={r.status === 'active' ? 'text-green-600' : 'text-gray-500'}>{r.status}</span>
            )},
          ]}
          rows={leases}
        />
        <div className="flex items-center justify-end gap-3 mt-3">
          <button
            onClick={() => loadLeases(leaseMeta.page - 1)}
            disabled={leaseMeta.page <= 1}
            className="text-xs text-blue-600 hover:underline disabled:text-gray-400 disabled:no-underline"
          >
            ← Prev
          </button>
          <span className="text-xs text-gray-500">
            Page {leaseMeta.page} of {leaseMeta.totalPages} ({leaseMeta.total} total)
          </span>
          <button
            onClick={() => loadLeases(leaseMeta.page + 1)}
            disabled={leaseMeta.page >= leaseMeta.totalPages}
            className="text-xs text-blue-600 hover:underline disabled:text-gray-400 disabled:no-underline"
          >
            Next →
          </button>
        </div>
      </Section>
      <Section title="Occupancy Report">
        <Table
          columns={[
            { key: 'property_name', label: 'Property' },
            { key: 'total_units', label: 'Total Units' },
            { key: 'occupied_units', label: 'Occupied' },
            { key: 'occupancy_rate_pct', label: 'Rate %', render: r => `${Number(r.occupancy_rate_pct)}%` },
          ]}
          rows={occupancy}
        />
      </Section>

      {/* Revenue Report */}
      <Section title="Monthly Revenue">
        <Table
          columns={[
            { key: 'property_name', label: 'Property' },
            { key: 'month', label: 'Month', render: r => r.month?.slice(0, 7) },
            { key: 'revenue_collected', label: 'Revenue', render: r => `₹${Number(r.revenue_collected).toLocaleString()}` },
          ]}
          rows={revenue}
        />
      </Section>

      {/* Running Total Chart */}
      <Section title="Revenue — Running Total">
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={350}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Line type="monotone" dataKey="running_total" stroke="#2563eb" strokeWidth={2} name="Running Total" />
              <Line type="monotone" dataKey="revenue" stroke="#16a34a" strokeWidth={2} name="Monthly Revenue" />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-sm text-gray-400">No revenue data yet</p>
        )}
      </Section>
    </div>
  );
}
