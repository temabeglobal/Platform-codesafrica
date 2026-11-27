import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import ModulePage from './pages/ModulePage';
import TaskDetail from './pages/TaskDetail';
import ProviderDetail from './pages/ProviderDetail';
import { modules } from './modules';
import { useEvents } from './events';
import { LoginScreen } from './components/CloudAccount';

export default function App() {
  // Connexion obligatoire : rien de la plateforme ne s'affiche avant d'être connecté
  // (un compte déjà connecté sur l'appareil reste ouvert hors connexion).
  const { cloud } = useEvents();
  if (cloud.enabled && cloud.checking) return <div className="min-h-screen bg-[var(--sand)]" aria-busy="true" />;
  if (cloud.enabled && cloud.status === 'signed-out') return <LoginScreen />;
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
