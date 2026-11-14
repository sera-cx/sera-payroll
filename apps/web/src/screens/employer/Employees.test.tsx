import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../../test/utils';
import { Employees } from './Employees';

describe('Address card states', () => {
  it('shows source, lock and missing-address states from the roster', async () => {
    renderApp(<Employees />, { user: 'u-prep-0' });
    expect(await screen.findByText('Aisyah Rahman')).toBeInTheDocument();
    expect(screen.getAllByText('Signed by employee').length).toBeGreaterThan(0);
    expect(screen.getByText('Entered by employer')).toBeInTheDocument();
    expect(screen.getByText('Locked')).toBeInTheDocument();
    expect(screen.getAllByText('No wallet address')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Unlock address' })).toBeInTheDocument();
  });

  it('employer can lock an address, which hides the replace form', async () => {
    const user = userEvent.setup();
    renderApp(<Employees />, { user: 'u-prep-0' });
    await screen.findByText('Aisyah Rahman');
    const row = screen.getByText('Aisyah Rahman').closest('.row') as HTMLElement;
    await user.click(within(row).getByRole('button', { name: 'Lock address' }));
    await waitFor(() => expect(within(row).getByRole('button', { name: 'Unlock address' })).toBeInTheDocument());
    expect(within(row).queryByRole('button', { name: 'Replace address' })).not.toBeInTheDocument();
    expect(within(row).getByText('Locked')).toBeInTheDocument();
  });

  it('imports the sample pay file and reports the count', async () => {
    const user = userEvent.setup();
    renderApp(<Employees />, { user: 'u-prep-0' });
    await screen.findByText('Aisyah Rahman');
    await user.click(screen.getByText('Bulk import from a pay file'));
    await user.click(screen.getByRole('button', { name: 'Load sample file' }));
    await user.click(screen.getByRole('button', { name: 'Import' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Imported 4.');
    expect(await screen.findByText('Siti Aminah')).toBeInTheDocument();
    expect(screen.getByText('Flagged by screening')).toBeInTheDocument();
  });
});
