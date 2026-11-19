import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

// Mavzu: Telegram rangiga qarab (yo'q bo'lsa brauzerniki)
const tg = window.Telegram && window.Telegram.WebApp;
const dark = tg && tg.colorScheme ? tg.colorScheme === 'dark' : window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
document.documentElement.dataset.theme = dark === false ? 'light' : 'dark';

createRoot(document.getElementById('root')).render(<App />);
