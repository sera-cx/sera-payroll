import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../../test/utils';
import { PayRun } from './PayRun';

describe('Pay run side panel', () => {
  it('renders the totals from the engine for the sample client', async () => {
    renderApp(<PayRun />, { user: 'u-prep-0' });
    expect(await screen.findByText('November 2026 pay run')).toBeInTheDocument();
    expect(screen.getByText('12,283.72')).toBeInTheDocument();
    expect(screen.getByText('Operator fee, 0.5%')).toBeInTheDocument();
    expect(screen.getByText('61.11 USDT')).toBeInTheDocument();
    expect(screen.getByText(/Fix 1 issue/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit for approval' })).toBeDisabled();
  });

  it('skipping the blocked person makes the run ready and the funding short notice shows', async () => {
    const user = userEvent.setup();
    renderApp(<PayRun />, { user: 'u-prep-0' });
    await screen.findByText('November 2026 pay run');
    const skips = screen.getAllByRole('button', { name: 'Skip this run' });
    await user.click(skips[skips.length - 1]!);
    await waitFor(() => expect(screen.queryByText(/Fix 1 issue/)).not.toBeInTheDocument());
    expect(screen.getByText(/Short by 283.72 USDT/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit for approval' })).toBeEnabled();
  });
});
