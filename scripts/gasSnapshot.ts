// Script per misurare e riportare i consumi di gas e i costi associati in ETH per le operazioni su SplitwiseManager e TrustToken
import { ethers } from "hardhat";

// Funzione helper che riceve in input un'etichetta, la ricevuta di transazione e il prezzo del gas,
// e calcola l'ammontare di gas usato, il costo in wei e in ETH, e stampa il risultato in console.
// Estrae la quantità di gas consumato dalla transazione tramite receipt.gas used, calcola il costo del gas moltiplicando gasUsed*gasPrice,
// e converte il costo in wei in formato ETH leggibile. Stampa il gas l'etichetta, il gas usato, il prezzo del gas e il costo del gas a video.
async function report(
  label: string,    // Descrizione dell'operazione
  receipt: any,     // restituito da tx.wait() che rappreesenta la transazione, contiene gasUsed
  gasPrice: bigint  // Prezzo del gas in wei
) {
  
  const gasUsed: bigint = receipt.gasUsed;
  
  // Calcola il costo totale in wei: gasUsed * gasPrice
  const costWei: bigint = gasUsed * gasPrice;
  
  // Converte il costo in wei in formato ETH leggibile (stringa decimale)
  const costEth = ethers.formatEther(costWei);
  
  // Converte il prezzo del gas da wei a gwei (1 gwei = 1e9 wei)
  const gweiPrice = Number(gasPrice) / 1e9;

  // Stampa formattata: etichetta, gasUsed, prezzo del gas in gwei e costo in ETH
  console.log(
    `${label.padEnd(20)} ➜ gas: ${gasUsed
      .toString()
      .padStart(8)} | price: ${gweiPrice.toFixed(2)} gwei | cost: ${costEth} ETH`
  );
}


async function main() {

  console.log("\n--- Gas snapshot SplitwiseManager ---\n");

  // Recupera il prezzo corrente del gas usando il metodo ethers.provider.send("eth_gasPrice", []);. 
  const gasPriceHex: string = await ethers.provider.send("eth_gasPrice", []);
  const gasPrice: bigint = BigInt(gasPriceHex);
  // Stampa il prezzo del gas in gwei
  console.log(`Gas price current: ${(Number(gasPrice) / 1e9).toFixed(2)} gwei\n`);

  //Ottiene gli account di test preconfigurati (owner, alice, bob, carol)
  const [owner, alice, bob, carol] = await ethers.getSigners();

  // Deploya il contratto TrustToken e riporta i consumi del gas per il deploy.
  const TT = await ethers.getContractFactory("TrustToken");
  const tt = await TT.deploy();
  const ttTx = tt.deploymentTransaction()!;
  const ttRcpt = await ttTx.wait();
  // Riporta i consumi di gas per il deploy
  await report("Deploy TrustToken", ttRcpt, gasPrice);

  // Effettua il Mint di 1000 token TTK per ciascun account (owner, alice, bob, carol) e stampa i consumi del gas per ogni mint
  const price: bigint = await tt.TOKENPRICE();
  for (const account of [owner, alice, bob, carol]) {
    const tx = await tt.connect(account).mint({ value: price * 1000n });
    const rcpt = await tx.wait();
    await report("mint 1000 TTK", rcpt, gasPrice);
  }

  // Deploy del contratto SplitwiseManager e stampa a video dei consumi del deploy.
  const SM = await ethers.getContractFactory("SplitwiseManager");
  const mgr = await SM.deploy(tt.getAddress());  
  const mgrTx = mgr.deploymentTransaction()!;       
  const mgrRcpt = await mgrTx.wait();             
  await report("Deploy Manager", mgrRcpt, gasPrice); 

  // Approva il manager a spendere un numero illimitato di token per ogni account e stampa a video del costo del gas.
  for (const acct of [owner, alice, bob, carol]) {
    // approve(spender, amount)
    const tx = await tt.connect(acct).approve(mgr.getAddress(), ethers.MaxUint256);
    const rcpt = await tx.wait();
    await report("approve", rcpt, gasPrice);
  }

  // Creazione di un gruppo "Trip" con owner + 3 membri (alice, bob, carol) e stampa a video del costo del gas.
  {
    const tx = await mgr.createGroup(
      "Trip",                          
      [alice.address, bob.address, carol.address] 
    );
    const rcpt = await tx.wait();
    await report("createGroup (4)", rcpt, gasPrice);
  }

  // Join al gruppo da parte di Carol e stampa del costo del gas.
  {
    // carol entra nel gruppo 0
    const tx = await mgr.connect(carol).joinGroup(0);
    const rcpt = await tx.wait();
    await report("joinGroup", rcpt, gasPrice);
  }

  // Aggiunta di una spesa con split Equal tra 3 partecipanti e stampa del costo del gas.
  const parts = [owner.address, alice.address, bob.address];
  {
    const tx = await mgr.addExpense(
      0,               
      30000,           
      owner.address,   
      parts,          
      0,               
      [],             
      "Equal"      
    );
    const rcpt = await tx.wait();
    await report("addExpense Equal", rcpt, gasPrice);
  }

  // Aggiunta di una spesa con split Exact e e stampa del costo del gas.
  {
    const tx = await mgr.addExpense(
      0,                 
      30000,             
      owner.address,     
      parts,             
      1,                 
      [10000, 15000, 5000], 
      "Exact"         
    );
    const rcpt = await tx.wait();
    await report("addExpense Exact", rcpt, gasPrice);
  }

  // Aggiunta di una spesa con split Percentage e stampa del costo del gas.
  {
    const tx = await mgr.addExpense(
      0,                  
      30000,            
      owner.address,     
      parts,             
      2,                 
      [3000, 5000, 2000], 
      "Percent"      
    );
    const rcpt = await tx.wait();
    await report("addExpense Percent", rcpt, gasPrice);
  }

  // Alice salda parte del suo debito verso owner (5000 unità) e stampa del costo del gas.
  {
    const tx = await mgr.connect(alice).settleDebt(
      0,             
      owner.address,   
      5000        
    );
    const rcpt = await tx.wait();
    await report("settleDebt", rcpt, gasPrice);
  }

  // Semplificazione dei debiti e stampa del costo del gas.
  {
    const tx = await mgr.simplifyDebts(0); // id gruppo
    const rcpt = await tx.wait();
    await report("simplifyDebts", rcpt, gasPrice);
  }

  console.log("\nSnapshot complete.\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
