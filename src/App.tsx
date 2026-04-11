import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './contexts/AppContext';
import { Header } from './components/Header';
import { DataCollectionPage } from './components/DataCollectionPage';
import { DataManagement } from './pages/DataManagement';
import './App.css';

function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <div className="min-h-screen bg-gray-100">
          <Header />
          <Routes>
            {/* 默认重定向到数据采集页面 */}
            <Route path="/" element={<Navigate to="/data-collection" replace />} />

            {/* 数据采集与可视化页面 */}
            <Route path="/data-collection" element={<DataCollectionPage />} />

            {/* 数据管理页面 */}
            <Route path="/data-management" element={<DataManagement />} />
          </Routes>
        </div>
      </BrowserRouter>
    </AppProvider>
  );
}

export default App;
