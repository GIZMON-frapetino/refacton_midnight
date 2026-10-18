const STEPS = [
  'Pick a plan that matches your problem',
  'Follow small steps, starting with a 15-minute one',
  "Stuck? Check the engineer's record, then ask them",
];

export default function CasePage({ onFindSteps }) {
  return (
    <>
      <section className="top-case" aria-labelledby="case-heading">
        <p className="top-case-label">Sample case</p>
        <h1 id="case-heading" tabIndex={-1}>Invoice intake</h1>
        <p className="top-case-description">Invoices arrive by email and on paper. Staff type each one into the accounting sheet by hand. It takes hours every month, and typos slip in.</p>
      </section>

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

      <button type="button" className="top-cta" onClick={onFindSteps}>Find steps for this case<span aria-hidden="true">→</span></button>
    </>
  );
}
