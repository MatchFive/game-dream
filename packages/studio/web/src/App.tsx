import { Navigate, Route, Routes } from 'react-router-dom';
import { Sprite } from './components/Sprite';
import { AssetsPage } from './pages/AssetsPage';
import { MissionPage } from './pages/MissionPage';
import { InsightsPage } from './pages/InsightsPage';
import { ScenesPage } from './pages/ScenesPage';
import { SettingsPage } from './pages/SettingsPage';

export function App() {
  return (
    <>
      <Sprite />
      <Routes>
        <Route path="/" element={<MissionPage />} />
        <Route path="/assets" element={<AssetsPage />} />
        <Route path="/scenes" element={<ScenesPage />} />
        <Route path="/scenes/insights" element={<InsightsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
