import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import ModulePage from './pages/ModulePage';
import TaskDetail from './pages/TaskDetail';
import ProviderDetail from './pages/ProviderDetail';
import { modules } from './modules';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        {modules.map((m) => (
          <Route key={m.path} path={m.path} element={<ModulePage module={m} />} />
        ))}
        {/* Anciennes pages retirées du menu : on renvoie vers la communication. */}
        <Route path="/programme" element={<Navigate to="/horaires" replace />} />
        <Route path="/media" element={<Navigate to="/communication" replace />} />
        <Route path="/documents" element={<Navigate to="/communication" replace />} />
        <Route path="/taches/:taskId" element={<TaskDetail />} />
        <Route path="/prestataires/:providerId" element={<ProviderDetail />} />
      </Route>
    </Routes>
  );
}
