import { describe, expect, it } from 'vitest';
import { privateKeyToAccount } from 'viem/accounts';
import { SeraSwapProvider, SeraApiError, INTENT_TYPES } from '../adapters/sera-swap.js';

/** Replays the documented Sera.cx responses (docs.sera.cx api-reference) so the provider is exercised without the network. */
function fakeSera() {
  const calls: { path: string; body: unknown; auth: string | null }[] = [];
  let staleOnce = true;
  const routeParams = { taker: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', inputToken: '0x8365421d0e1b316fc6398d21be162992216bf2ad', outputToken: '0x66d3b49b587b970b5835751708136adb805f1fe4', maxInputAmount: '1000000', minOutputAmount: '4190000', recipient: '0x71C2a4b9E05d3F8a61B7c0D2e94F5a3B8c6D9c4E', initialDepositAmount: '1000000', uuid: '123456789', deadline: 1713254400 };
  const f: typeof fetch = async (input, init) => {
    const url = String(input);
    const path = url.replace(/^.*\/api\/v1/, '');
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    const auth = (init?.headers as Record<string, string>)?.authorization ?? null;
    calls.push({ path, body, auth });
    const json = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
    if (path === '/config') return json(200, { chain_id: 11155111, sera_address: '0x83475A1bD98a8DC2DCd507A747e4DC85da241D6e', vault_address: '0x3c7945840bAE0d7e7f3824Ebccef1962629250F0', sor_address: '0x83c1368110B640A729f3810De5FBe94b99aa5668' });
    if (path === '/tokens') return json(200, { tokens: [{ currency: 'USD', symbol: 'USDT', address: routeParams.inputToken, decimals: 6 }, { currency: 'MYR', symbol: 'MYRT', address: routeParams.outputToken, decimals: 6 }] });
    if (path === '/system/time') return json(200, { timestamp: 1713250000 });
    if (path === '/swap/quote') return json(200, { uuid: '6d0ad60d-quote', route_params: routeParams, fee_breakdown: { gas_cost_usd: '0.12' }, expires_at: 1713250830, permit: { permit_supported: true, permit_required: true, token: routeParams.inputToken, spender: '0x83c1368110B640A729f3810De5FBe94b99aa5668', owner: routeParams.taker, value_raw: '1000000', nonce: 4, suggested_deadline: 1713254400, eip712: { domain: { name: 'Tether USD', version: '1', chainId: 11155111, verifyingContract: routeParams.inputToken }, primaryType: 'Permit', types: { Permit: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }, { name: 'value', type: 'uint256' }, { name: 'nonce', type: 'uint256' }, { name: 'deadline', type: 'uint256' }] }, message: { owner: routeParams.taker, spender: '0x83c1368110B640A729f3810De5FBe94b99aa5668', value: '1000000', nonce: 4, deadline: 1713254400 } } } });
    if (path === '/swap') {
      if (staleOnce) { staleOnce = false; return json(409, { detail: { detail: 'Swap execution failed', error_code: 'QUOTE_STALE' } }); }
      if (!body.signature || !body.permit_signature) return json(400, { detail: 'missing signature' });
      return json(200, { success: true, trade_id: '85c9-trade', status: 'pending' });
    }
    if (path === '/orders/85c9-trade') {
      if (!auth) return json(401, { detail: 'Unauthorized' });
      return json(200, { status: 'settled', order_type: 'swap', settlement_summary: { status: 'settled', latest_tx_hash: '0x' + 'ab'.repeat(32) }, settlement_economics: { gross_credits: [{ token: 'MYRT', token_address: routeParams.outputToken, amount: '4.19', amount_raw: '4190000' }] } });
    }
    return json(404, { detail: 'nope' });
  };
  return { f, calls };
}

describe('SeraSwapProvider', () => {
  it('fetches a settleable rate from /swap/quote with raw amounts and a third-party recipient', async () => {
    const { f, calls } = fakeSera();
    const p = new SeraSwapProvider({ baseUrl: 'https://api-testnet.sera.cx/api/v1', fetch: f });
    const r = await p.getRate('USDT', 'MYRT', '1', 'sepolia', '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', '0x71C2a4b9E05d3F8a61B7c0D2e94F5a3B8c6D9c4E');
    expect(r.amountOut).toBe('4.19');
    expect(r.reference).toBe('6d0ad60d-quote');
    const q = calls.find((c) => c.path === '/swap/quote')!.body as Record<string, unknown>;
    expect(q.from_amount).toBe('1000000');
    expect(q.gas_mode).toBe('receive_less');
    expect(q.owner_address).toBe('0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266');
    expect(q.recipient).toBe('0x71C2a4b9E05d3F8a61B7c0D2e94F5a3B8c6D9c4E');
    expect(Number(q.expiration)).toBe(1713250000 + 600);
  });
  it('settles by signing route_params as the Intent plus the permit, re-fetching once on QUOTE_STALE, then polls the order with the API key', async () => {
    const { f, calls } = fakeSera();
    const p = new SeraSwapProvider({ baseUrl: 'https://api-testnet.sera.cx/api/v1', fetch: f, apiKey: 'sera_k', apiSecret: 's' });
    const acct = privateKeyToAccount('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');
    const signed: string[] = [];
    const signer = { address: acct.address, signTypedData: async (a: { domain: Record<string, unknown>; types: Record<string, { name: string; type: string }[]>; primaryType: string; message: Record<string, unknown> }) => { signed.push(a.primaryType); return acct.signTypedData(a as never); } };
    const [res] = await p.settle([{ payoutId: 'po-1', from: 'USDT', to: 'MYRT', amountIn: '1', minAmountOut: '4.19', recipient: '0x71C2a4b9E05d3F8a61B7c0D2e94F5a3B8c6D9c4E', rateReference: '' }], signer, 'sepolia', 'key');
    expect(res!.status).toBe('submitted');
    expect(res!.reason).toBe('85c9-trade');
    expect(signed).toEqual(['Intent', 'Permit', 'Intent', 'Permit']); // once, stale, once more
    const swaps = calls.filter((c) => c.path === '/swap');
    expect(swaps).toHaveLength(2);
    expect((swaps[1]!.body as { uuid: string }).uuid).toBe('6d0ad60d-quote');
    expect(INTENT_TYPES.Intent.map((x) => x.name)).toEqual(['taker', 'inputToken', 'outputToken', 'maxInputAmount', 'minOutputAmount', 'recipient', 'initialDepositAmount', 'uuid', 'deadline']);
    const st = await p.getStatus('po-1');
    expect(st!.status).toBe('settled');
    expect(st!.txHash).toBe('0x' + 'ab'.repeat(32));
    expect(st!.amountOut).toBe('4.19');
    expect(calls.find((c) => c.path === '/orders/85c9-trade')!.auth).toBe('Bearer sera_k:s');
    // Settling the same payout again is a status read, not a second swap
    const [again] = await p.settle([{ payoutId: 'po-1', from: 'USDT', to: 'MYRT', amountIn: '1', minAmountOut: '4.19', recipient: '0x71C2a4b9E05d3F8a61B7c0D2e94F5a3B8c6D9c4E', rateReference: '' }], signer, 'sepolia', 'key');
    expect(again!.status).toBe('settled');
    expect(calls.filter((c) => c.path === '/swap')).toHaveLength(2);
  });
  it('surfaces Sera.cx error codes and refuses status reads without an API key', async () => {
    const { f } = fakeSera();
    const p = new SeraSwapProvider({ baseUrl: 'https://api-testnet.sera.cx/api/v1', fetch: f });
    await expect(p.token('JPYC' as never)).rejects.toBeInstanceOf(SeraApiError);
    p.rememberTrade('po-9', '85c9-trade', 'MYRT');
    await expect(p.getStatus('po-9')).rejects.toMatchObject({ errorCode: 'NO_API_KEY' });
    const prepared = await p.prepareIntent({ payoutId: 'po-2', from: 'USDT', to: 'MYRT', amountIn: '1', minAmountOut: '4.19', recipient: '0x71C2a4b9E05d3F8a61B7c0D2e94F5a3B8c6D9c4E', rateReference: '' }, '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
    expect(prepared.domain).toEqual({ name: 'Sera', version: '1', chainId: 11155111, verifyingContract: '0x83475A1bD98a8DC2DCd507A747e4DC85da241D6e' });
    expect(prepared.permit?.permit_required).toBe(true);
  });
});
