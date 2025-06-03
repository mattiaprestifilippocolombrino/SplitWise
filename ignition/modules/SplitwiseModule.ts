// ignition/modules/SplitwiseModule.ts
import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("SplitwiseModule", (m) => {
  // 1. Deploy del token ERC-20
  const trustToken = m.contract("TrustToken");

  // 2. Deploy di SplitwiseManager con il costruttore che richiede l’indirizzo del token
  const splitwiseManager = m.contract("SplitwiseManager", [trustToken]);

  // 3. Ritorno delle istanze per usarle in test o in altri moduli
  return { trustToken, splitwiseManager };
});
