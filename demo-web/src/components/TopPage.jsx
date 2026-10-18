import { useState } from 'react';
import App from '../App.jsx';
import ChatFlow from './ChatFlow.jsx';
import refactonLogo from '../assets/refacton-logo.png';
import './TopPage.css';

export default function TopPage() {
  const [screen, setScreen] = useState('top');

  function openExistingDemo(event) {
    event.preventDefault();
    setScreen('demo');
    window.scrollTo(0, 0);
    requestAnimationFrame(() => document.getElementById('demo-panel')?.focus());
  }

  function startDemo() {
    setScreen('chat');
    window.scrollTo(0, 0);
    requestAnimationFrame(() => document.getElementById('chat-heading')?.focus());
  }

  if (screen === 'demo') return <App />;

  return (
    <div className={`top-page ${screen === 'top' ? 'top-landing' : 'chat-page'}`}>
      <header className="top-header">
        <span className="top-brand" aria-label="Refacton">
          <img src={refactonLogo} alt="" width="22" height="26" />
          <span>refacton<span className="top-brand-dot">.</span></span>
        </span>
        <a className="top-engineer-link" href="#demo-panel" onClick={openExistingDemo}>Engineer view</a>
      </header>

      <main className="top-main">
        {screen === 'top' ? (
          <>
            <section className="top-hero" aria-labelledby="top-heading">
              <h1 id="top-heading">Follow an engineer's real steps. Ask only where you get stuck.</h1>
            </section>
            <button type="button" className="top-cta" onClick={startDemo}>Start demo</button>
          </>
        ) : (
          <ChatFlow />
        )}
      </main>

      <footer className="top-footer">
        <p>Demo: runs in a local browser simulator, not on a network yet.</p>
      </footer>
    </div>
  );
}
