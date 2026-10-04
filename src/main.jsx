import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/big-shoulders-display/700';
import '@fontsource/big-shoulders-display/800';
import '@fontsource/schibsted-grotesk/400';
import '@fontsource/schibsted-grotesk/600';
import './styles.css';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
