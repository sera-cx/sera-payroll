import { Loading } from '../../components/Common';
import { useOutbox } from '../../hooks/employer';
import { when } from '../../lib/format';

export function Outbox() {
  const q = useOutbox();
  return (
    <>
      <h1>Outbox</h1>
      <p className="sub">Every email this app has sent or logged. In the demo nothing leaves the server.</p>
      <div className="card mt">
        {!q.data && <div className="row"><Loading /></div>}
        {q.data?.length === 0 && <div className="row"><span className="sub">Nothing yet. Send a run, invite someone or request an address change.</span></div>}
        {q.data?.map((m) => (
          <div className="row" key={m.id}>
            <div className="rowtop"><span className="name">{m.subject}</span><span className="fine">{when(m.at)}</span></div>
            <div className="fine">To: {m.to}</div>
          </div>
        ))}
      </div>
    </>
  );
}
