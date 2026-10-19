import { useRef, useState } from 'react';
import ChatFlow from './ChatFlow.jsx';
import SellerFlow from './SellerFlow.jsx';
import useDemoSession from './useDemoSession.js';
import NetworkPanel from './NetworkPanel.jsx';
import refactonLogo from '../assets/refacton-logo.png';
import './TopPage.css';
import './BusinessFlow.css';

export default function TopPage() {
  const [mode, setMode] = useState('simulator');
  return <DemoJourney key={mode} mode={mode} onModeChange={setMode} />;
}

function DemoJourney({ mode, onModeChange }) {
  const [screen, setScreen] = useState('top');
  const [businessStage, setBusinessStage] = useState('chat');
  const [engineerStep, setEngineerStep] = useState(2);
  const businessRef = useRef(null);
  const { session, updateSession, demoLog, appendLog } = useDemoSession(mode);

  function openExistingDemo(event) {
    event?.preventDefault();
    setScreen('engineer');
    window.scrollTo(0, 0);
    requestAnimationFrame(() => document.getElementById('engineer-heading')?.focus());
  }

  function startDemo() {
    setScreen('chat');
    window.scrollTo(0, 0);
    requestAnimationFrame(() => document.getElementById('chat-heading')?.focus());
  }

  function backToBusiness() {
    setScreen('chat');
    businessRef.current?.openCheck();
    window.scrollTo(0, 0);
  }

  return (
    <div className={`top-page ${screen === 'top' ? 'top-landing' : screen === 'engineer' ? 'engineer-page' : 'chat-page'}`}>
      <header className="top-header">
        <span className="top-brand" aria-label="Refacton">
          <img src={refactonLogo} alt="" width="22" height="26" />
          <span>refacton<span className="top-brand-dot">.</span></span>
        </span>
        <a className="top-engineer-link" href="#engineer-record" onClick={openExistingDemo}>Engineer view</a>
      </header>

      <NetworkPanel mode={mode} onModeChange={onModeChange} />
      <main className="top-main">
        {screen === 'top' && (
          <>
            <section className="top-hero" aria-labelledby="top-heading">
              <h1 id="top-heading">Follow an engineer's real steps. Ask only where you get stuck.</h1>
            </section>
            <button type="button" className="top-cta" onClick={startDemo}>Start demo</button>
          </>
        )}
        <div className="business-mount" hidden={screen !== 'chat'}>
          <ChatFlow ref={businessRef} session={session} onSessionChange={updateSession} appendLog={appendLog} demoLog={demoLog} onOpenEngineer={openExistingDemo} onStageChange={setBusinessStage} />
        </div>
        {screen === 'engineer' && (
          <section id="engineer-record" aria-label="Engineer record">
            <SellerFlow session={session} onSessionChange={updateSession} appendLog={appendLog} ledgerView={session?.ledger} demoLog={demoLog} step={session?.recorded ? 3 : engineerStep} onStepChange={setEngineerStep} onCheckAsBuyer={backToBusiness} engineerView />
          </section>
        )}
      </main>

      {!(screen === 'chat' && businessStage === 'final') && <footer className="top-footer"><p>{mode === 'simulator' ? 'Demo: runs in a local browser simulator, not on a network yet.' : 'Preprod integration draft: deployment unfinished. No address supplied.'}</p></footer>}
    </div>
  );
}
