import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { ErrorNote, Loading } from '../../components/Common';
import { useSession } from '../../lib/session';

export function InvitePage({ token }: { token: string }) {
  const q = useQuery({ queryKey: ['invite', token], queryFn: () => api.invite_(token), enabled: !!token });
  const { refresh } = useSession();
  const qc = useQueryClient();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const accept = useMutation({ mutationFn: () => api.acceptInvite(token, email), onSuccess: async () => { await qc.invalidateQueries(); refresh(); nav('/employee'); } });
  if (q.error) return <ErrorNote error={q.error} />;
  if (!q.data) return <Loading />;
  return (
    <div className="phone mt">
      <div><h1 style={{ fontSize: 26 }}>Hello {q.data.personName}</h1><p className="sub">{q.data.clientName} pays you through {q.data.brand}. Set up how you want to be paid.</p></div>
      <form className="card pad" onSubmit={(e) => { e.preventDefault(); accept.mutate(); }}>
        <label>Your email<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <button type="submit" className="cta" disabled={accept.isPending}>Continue</button>
        {accept.error && <ErrorNote error={accept.error} />}
      </form>
    </div>
  );
}
