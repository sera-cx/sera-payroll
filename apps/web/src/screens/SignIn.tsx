import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '../api';
import { useSession } from '../lib/session';

export function SignIn() {
  const { me } = useSession();
  const [email, setEmail] = useState('');
  const m = useMutation({ mutationFn: api.magicLink });
  return (
    <div className="phone mt">
      <div><h1 style={{ fontSize: 26 }}>Sign in</h1><p className="sub">{me.demoMode ? 'This is a demo. Use "Sign in as" in the top bar to try each role with sample data.' : 'We will email you a sign-in link.'}</p></div>
      {!me.demoMode && (
        <form className="card pad" onSubmit={(e) => { e.preventDefault(); m.mutate(email); }}>
          <label>Email<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <button type="submit" className="cta" disabled={m.isPending}>Send me a link</button>
          {m.isSuccess && <p className="fine strong">If that address is known, a link is on its way.</p>}
        </form>
      )}
    </div>
  );
}
