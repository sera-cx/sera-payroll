import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../../test/utils';
import { PayRun } from './PayRun';
import * as S from '../../mocks/state';

describe('Sign dialog, demo path', () => {
  it('approver signs without a wallet in demo mode and the run moves to tracking', async () => {
    const user = userEvent.setup();
    // Prepare: skip the blocked person, top up, submit as preparer.
    S.login('u-prep-0');
    S.skip('client-studio', 'p5', true);
    S.topup('client-studio');
    S.submit('client-studio');
    renderApp(<PayRun />, { user: 'u-appr-0' });
    const open = await screen.findByRole('button', { name: 'Review, sign and send' });
    expect(open).toBeEnabled();
    await user.click(open);
    const dlg = await screen.findByRole('dialog');
    expect(dlg).toHaveTextContent('Swaps on Sera.cx');
    const demo = screen.getByRole('button', { name: 'Sign and send (demo)' });
    expect(demo).toHaveFocus();
    await user.click(demo);
    await waitFor(() => expect(screen.getByText('Signed and sent')).toBeInTheDocument());
    expect(screen.getByText('Payout tracking')).toBeInTheDocument();
    expect(screen.getByText('Draft the next run')).toBeInTheDocument();
  });

  it('the preparer cannot approve their own run', async () => {
    S.login('u-prep-0');
    S.skip('client-studio', 'p5', true);
    S.topup('client-studio');
    S.submit('client-studio');
    renderApp(<PayRun />, { user: 'u-prep-0' });
    expect(await screen.findByRole('button', { name: 'Review, sign and send' })).toBeDisabled();
    expect(screen.getByText(/another approver must sign it/)).toBeInTheDocument();
  });
});
