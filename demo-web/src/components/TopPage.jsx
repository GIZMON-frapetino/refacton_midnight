import { useState } from 'react';
import App from '../App.jsx';
import refactonLogo from '../assets/refacton-logo.png';
import './TopPage.css';

const STEPS = [
  'Pick a plan that matches your problem',
  'Follow small steps, starting with a 15-minute one',
  "Stuck? Check the engineer's record, then ask them",
];

export default function TopPage() {
  const [demoOpened, setDemoOpened] = useState(false);

  function openExistingDemo(event) {
    event.preventDefault();
    setDemoOpened(true);
    window.scrollTo(0, 0);
    requestAnimationFrame(() => document.getElementById('demo-panel')?.focus());
  }

  if (demoOpened) return <App />;

  return (
    <div className="top-page">
      <header className="top-header">
        <span className="top-brand" aria-label="Refacton">
          <img src={refactonLogo} alt="" width="22" height="26" />
          <span>refacton<span className="top-brand-dot">.</span></span>
        </span>
        <a className="top-engineer-link" href="#demo-panel" onClick={openExistingDemo}>Engineer view</a>
      </header>

      <main className="top-main">
        <section className="top-hero" aria-labelledby="top-heading">
          <h1 id="top-heading">Automate office work by following an engineer's real steps.</h1>
          <p>Do it in-house. Ask the engineer only where you get stuck. The engineer's name is never shown.</p>
        </section>

        <section className="top-case" aria-labelledby="case-heading">
          <p className="top-case-label">Sample case</p>
          <h2 id="case-heading">Invoice intake</h2>
          <p className="top-case-description">Invoices arrive by email and on paper. Staff type each one into the accounting sheet by hand. It takes hours every month, and typos slip in.</p>
        </section>

        <button type="button" className="top-cta" onClick={openExistingDemo}>Find steps for this case<span aria-hidden="true">→</span></button>

        <section className="top-how" aria-labelledby="how-heading">
          <h2 id="how-heading">How it works</h2>
          <ol className="top-steps">
            {STEPS.map((step, index) => (
              <li key={step}>
                <span className="top-step-number" aria-hidden="true">{index + 1}</span>
                <p>{step}</p>
              </li>
            ))}
          </ol>
        </section>

      </main>

      <footer className="top-footer">
        <p>Demo: runs in a local browser simulator, not on a network yet.</p>
      </footer>
    </div>
  );
}
