const QUEST_TASKS = [
  'Collect 10 sample invoices.',
  'Extract date, amount, vendor.',
  'Check results against the originals.',
];

export default function QuestWorkContent() {
  return (
    <>
      <ul className="quest-list">
        {QUEST_TASKS.map((task, i) => <li key={task}><span className="task-number">{i + 1}</span><span>{task}</span></li>)}
      </ul>
      <div className="intro-note"><span className="mock-tag">mock</span><p>Work note (sample, kept on your device): why this setup, what failed, how you fixed it.</p></div>
    </>
  );
}
