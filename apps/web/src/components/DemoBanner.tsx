import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { useToast } from '../lib/toast';

export function DemoBanner({ canReset }: { canReset: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const reset = useMutation({ mutationFn: api.resetDemo, onSuccess: async () => { await qc.invalidateQueries(); toast('Demo reset to the starting data'); } });
  return (
    <div className="note">
      <span><strong>DEMO SITE</strong>Sample data on the Sepolia testnet. Nothing is sent, emailed or paid for real. Free to fork: add your own database, emails and ramp partners. <a href="https://github.com/sera-cx/sera-payroll" target="_blank" rel="noreferrer">github.com/sera-cx/sera-payroll</a></span>
      {canReset && <button type="button" className="ghostbtn small" disabled={reset.isPending} onClick={() => reset.mutate()}>Reset demo</button>}
    </div>
  );
}
