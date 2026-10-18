import { useState } from 'react';
import './ChatFlow.css';

const SAMPLE_MESSAGE = 'We type every invoice into our accounting sheet by hand. It takes hours each month and typos slip in.';
const PLAN_STEPS = [
  { title: 'Map the invoice flow', time: '15 min' },
  { title: 'Collect sample invoices' },
  { title: 'Build the extraction step' },
  { title: 'Check date, amount and vendor' },
  { title: 'Write to the accounting sheet' },
  { title: 'Hand off the workflow' },
];

export default function ChatFlow() {
  const [draft, setDraft] = useState(SAMPLE_MESSAGE);
  const [message, setMessage] = useState(null);
  const [outline, setOutline] = useState(false);

  function sendMessage(event) {
    event.preventDefault();
    const next = draft.trim();
    if (!next) return;
    setMessage(next);
    window.scrollTo(0, 0);
    requestAnimationFrame(() => document.getElementById('reply-heading')?.focus());
  }

  function usePlan() {
    setOutline(true);
    window.scrollTo(0, 0);
    requestAnimationFrame(() => document.getElementById('outline-heading')?.focus());
  }

  if (outline) {
    return (
      <section className="chat-outline" aria-labelledby="outline-heading">
        <p className="chat-sample-label">Sample plan <span className="chat-mock">(MOCK)</span></p>
        <h1 id="outline-heading" tabIndex={-1}>Plan outline</h1>
        <div className="chat-plan-card">
          <h2>Automate invoice intake</h2>
          <p className="chat-engineer">Engineer #A12 · Anonymous</p>
          <p className="chat-plan-meta">6 steps · Start with 15 minutes</p>
          <ol className="chat-plan-steps">
            {PLAN_STEPS.map((step, index) => (
              <li key={step.title}>
                <span className="chat-step-number" aria-hidden="true">{index + 1}</span>
                <div><strong>{step.title}</strong>{step.time && <span className="chat-time">{step.time}</span>}</div>
              </li>
            ))}
          </ol>
        </div>
        <p className="chat-help">The next screens of this walkthrough are not built yet.</p>
      </section>
    );
  }

  return (
    <section className="chat-content" aria-labelledby="chat-heading">
      <h1 id="chat-heading" tabIndex={-1}>What do you want to automate?</h1>
      {message === null ? (
        <form className="chat-composer" onSubmit={sendMessage}>
          <label className="chat-role" htmlFor="business-message">Business user</label>
          <textarea id="business-message" className="chat-input" rows={4} value={draft} onChange={(event) => setDraft(event.target.value)} />
          <button type="submit" className="top-cta" disabled={!draft.trim()}>Send</button>
          <p className="chat-help">Sample message. No AI runs in this demo.</p>
        </form>
      ) : (
        <div className="chat-thread">
          <div className="chat-user-bubble"><p className="chat-role">Business user</p><p>{message}</p></div>
          <section className="chat-reply" aria-labelledby="reply-heading" aria-live="polite">
            <p className="chat-sample-label">Sample reply <span className="chat-mock">(MOCK)</span></p>
            <h2 id="reply-heading" tabIndex={-1}>Manual entry from mixed email and paper invoices</h2>
            <div className="chat-plan-card">
              <h3>Automate invoice intake</h3>
              <p className="chat-engineer">Engineer #A12 · Anonymous</p>
              <p className="chat-plan-meta">6 steps · First step 15 min</p>
              <p className="chat-plan-fit">Why it fits: It starts with your invoice flow and targets repeated manual typing.</p>
            </div>
            <p className="chat-help">Fixed sample reply. No AI runs in this demo.</p>
          </section>
          <button type="button" className="top-cta" onClick={usePlan}>Use this plan</button>
        </div>
      )}
    </section>
  );
}
