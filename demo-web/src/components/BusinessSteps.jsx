import { useState } from 'react';
import { PLAN_STEPS } from './invoicePlan.js';
import QuestWorkContent from './QuestWorkContent.jsx';

const FLOW_ITEMS = [
  'Where invoices arrive (email / paper)',
  'Who types them in',
  'Where they are typed (sheet / accounting app)',
  'Where mistakes happen',
];
const FIELDS = ['Vendor', 'Invoice date', 'Invoice number', 'Amount', 'Tax', 'Due date', 'Bank account'];

export default function BusinessSteps({ step, onNext, onAsk }) {
  const [checked, setChecked] = useState([]);
  const [fields, setFields] = useState(FIELDS.slice(0, 5));
  const ready = step === 1 ? checked.length === FLOW_ITEMS.length : step === 2 ? fields.length > 0 : true;

  function toggle(setValue, value) {
    setValue((prev) => prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]);
  }

  return (
    <section className="business-work" aria-labelledby="work-heading">
      <div className="business-progress"><span>Step {step} of 6</span><span className="mock-tag">Sample</span></div>
      <h1 id="work-heading" tabIndex={-1}>{PLAN_STEPS[step - 1].title}</h1>
      <p className="business-duration">{PLAN_STEPS[step - 1].time}</p>

      {step === 1 && (
        <div className="business-checklist">
          {FLOW_ITEMS.map((item, i) => (
            <label key={item} htmlFor={`flow-item-${i}`}><input id={`flow-item-${i}`} type="checkbox" checked={checked.includes(item)} onChange={() => toggle(setChecked, item)} /><span>{item}</span></label>
          ))}
        </div>
      )}
      {step === 2 && (
        <>
          <div className="business-fields" role="group" aria-label="Data fields">
            {FIELDS.map((field) => <button key={field} type="button" aria-pressed={fields.includes(field)} onClick={() => toggle(setFields, field)}>{field}</button>)}
          </div>
          <p className="business-help">These are the fields the automation will read.</p>
        </>
      )}
      {step === 3 && (
        <>
          <div className="business-diagram" role="img" aria-label="Input email or PDF, then extract fields, check, and export to sheet">
            <div>Input<small>email / PDF</small></div><span aria-hidden="true">&gt;</span><div>Extract fields</div><span aria-hidden="true">&gt;</span><div>Check</div><span aria-hidden="true">&gt;</span><div>Export to sheet</div>
          </div>
          <p className="business-help">Read incoming invoices, extract the chosen fields, check them, then export to your sheet.</p>
        </>
      )}
      {step === 4 && <QuestWorkContent />}
      {step === 5 && (
        <div className="business-sample-result"><span className="mock-tag">MOCK</span><h2>8 of 10 matched.</h2><p>2 failed: handwritten invoices.</p></div>
      )}

      {step < 5 ? (
        <button type="button" className="top-cta" onClick={onNext} disabled={!ready}>Done, next step</button>
      ) : (
        <button type="button" className="top-cta" onClick={onAsk}>I'm stuck here: ask the engineer</button>
      )}
    </section>
  );
}
