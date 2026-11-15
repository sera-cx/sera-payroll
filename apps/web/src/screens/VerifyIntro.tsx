/** Explanatory copy for the verifier page, shared by the live page and its prerendered HTML. */
export function VerifyIntro() {
  return (
    <header>
      <h1>Verify a payslip proof</h1>
      <p className="sub">Someone shared a proof of one or more payslip fields with you, for example net pay and pay date. Paste it here. Each field is checked against the payslip root in your browser, and when the payslip is anchored on chain the root is compared with the PayslipRegistry contract. You never see the fields that were not shared.</p>
      <ul className="intro-list">
        <li>A proof is a JSON bundle with a <code>root</code> and, for each field, its <code>name</code>, <code>value</code>, <code>salt</code> and Merkle <code>proof</code>.</li>
        <li>The root is the payslip's sorted-pair Merkle root over salted <code>keccak256(abi.encode(name, value, salt))</code> leaves.</li>
        <li>Proofs from the demo verify locally. Proofs from a live operator also match an anchor on chain.</li>
      </ul>
    </header>
  );
}
