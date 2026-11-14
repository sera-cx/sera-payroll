const SECTIONS = [
  'What we are building', 'Who uses it', 'Roles and views', 'Decisions already made', 'What the prototype simulates and what the real build does',
  'Rules and formulas', 'State machines', 'Data model', 'Interfaces', 'Pay file format for bulk import', 'Security requirements', 'Risks to keep visible',
  'Brand and copy rules', 'Placeholders to replace', 'Build order', 'Where things are', 'Still open', 'On-chain payslips',
];
const REPO = 'https://github.com/sera-cx/sera-payroll';

export function BuildNotes() {
  return (
    <div className="notes">
      <h1>Build notes</h1>
      <p className="sub">The notes live in the repository so forks keep them with the code. Each section below opens on GitHub.</p>
      <ol className="mt">
        {SECTIONS.map((s, i) => (
          <li key={s}><a href={`${REPO}/blob/main/docs/BUILD_NOTES.md#${i + 1}-${s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-$/, '')}`} target="_blank" rel="noreferrer">{s}</a></li>
        ))}
      </ol>
      <p className="fine mt">Also in the repository: <a href={`${REPO}/blob/main/docs/API.md`} target="_blank" rel="noreferrer">the API contract</a>, <a href={`${REPO}/blob/main/docs/ON_CHAIN_PAYSLIP.md`} target="_blank" rel="noreferrer">on-chain payslips</a> and the README that explains what a fork must add.</p>
    </div>
  );
}
