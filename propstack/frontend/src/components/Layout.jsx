import { Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <span className="text-lg font-semibold text-gray-800">PropStack</span>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">
            {user?.email} <span className="ml-1 px-2 py-0.5 bg-gray-100 rounded text-xs font-medium">{user?.role}</span>
          </span>
          <button onClick={handleLogout} className="text-sm text-red-600 hover:text-red-800">Logout</button>
        </div>
      </nav>
      <main className="max-w-6xl mx-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}
