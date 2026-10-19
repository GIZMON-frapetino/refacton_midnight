import { useEffect, useState } from 'react';

export default function Disclosure({ title, badge, children, className = '' }) {
  const [open, setOpen] = useState(() => window.matchMedia('(min-width: 900px)').matches);

  useEffect(() => {
    const query = window.matchMedia('(min-width: 900px)');
    const update = (event) => setOpen(event.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  return (
    <details className={`disclosure ${className}`} open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>
        <span>{title}</span>
        {badge && <span className={badge === 'contract' ? 'contract-tag' : 'mock-tag'}>{badge}</span>}
        <span className="disclosure-arrow" aria-hidden="true" />
      </summary>
      <div className="disclosure-body">{children}</div>
    </details>
  );
}
