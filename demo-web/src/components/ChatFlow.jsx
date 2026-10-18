import { forwardRef, useImperativeHandle, useState } from 'react';
import { PLAN_STEPS } from './invoicePlan.js';
import BusinessSteps from './BusinessSteps.jsx';
import BuyerFlow from './BuyerFlow.jsx';
import './ChatFlow.css';

const SAMPLE_MESSAGE = 'We type every invoice into our accounting sheet by hand. It takes hours each month and typos slip in.';

export default forwardRef(function ChatFlow({ session, onSessionChange, appendLog, demoLog, onOpenEngineer, onStageChange }, ref) {
  const [draft, setDraft] = useState(SAMPLE_MESSAGE);
  const [message, setMessage] = useState(null);
  const [stage, setStage] = useState('chat');
  const [workStep, setWorkStep] = useState(1);

  function navigate(next, heading) {
    setStage(next);
    onStageChange?.(next);
    window.scrollTo(0, 0);
    requestAnimationFrame(() => document.getElementById(heading)?.focus());
  }

  useImperativeHandle(ref, () => ({ openCheck: () => navigate('check', 'flow-heading') }));

  function sendMessage(event) {
    event.preventDefault();
    const next = draft.trim();
    if (!next) return;
    setMessage(next);
    window.scrollTo(0, 0);
    requestAnimationFrame(() => document.getElementById('reply-heading')?.focus());
  }

  function usePlan() {
    navigate('outline', 'outline-heading');
  }

  if (stage === 'steps') {
    return <BusinessSteps step={workStep} onNext={() => { setWorkStep((prev) => prev + 1); navigate('steps', 'work-heading'); }} onAsk={() => navigate('check', 'flow-heading')} />;
  }

  if (stage === 'check') {
    return <section className="business-check"><p className="business-progress">Step 6 of 6</p><BuyerFlow key={session?.questIdHex || 'no-record'} session={session} onSessionChange={onSessionChange} appendLog={appendLog} ledgerView={session?.ledger} demoLog={demoLog} onStartSeller={onOpenEngineer} businessView onFinish={() => navigate('final', 'final-heading')} /></section>;
  }

  if (stage === 'final') {
    return <section className="business-final"><span className="mock-tag">Sample next step</span><h1 id="final-heading" tabIndex={-1}>Next: hire Engineer #A12 for step 5 only.</h1><p>Runs in a local browser simulator, not on a network yet.</p><small>No payment or hire is made in this demo.</small></section>;
  }

  if (stage === 'outline') {
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
        <button type="button" className="top-cta" onClick={() => { setWorkStep(1); navigate('steps', 'work-heading'); }}>Start step 1</button>
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
});
