import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';

function Root() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="p-8 rounded-xl shadow-sm bg-white">
        <h1 className="text-3xl font-bold text-blue-600">Sh_thead Game</h1>
        <p className="mt-2 text-gray-600">Vite + React + Tailwind are running.</p>
      </div>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>
);
