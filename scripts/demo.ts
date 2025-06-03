// scripts/demo.ts
import { ethers } from "hardhat";


async function main(): Promise<void> {
  /*
  await ethers.getSigners() dà un array di oggetti Signer corrispondenti agli account di test messi a disposizione da Hardhat.
  Li chiamiamo alice, bob e carl.
  */
  const [alice, bob, carl] = await ethers.getSigners();
  const nameOf: Record<string,string> = {
    [alice.address]: "Alice",
    [bob.address]:   "Bob",
    [carl.address]:  "Carl"
  };
  const members = [alice.address, bob.address, carl.address];

  /*
  ethers.deployContract("TrustToken") crea e inviare automaticamente la transazione di deploy del contratto TrustToken 
  e restituisce immediatamente un oggetto Contract il cui deployment è “in corso”.
  await token.waitForDeployment(); sospende l’esecuzione finché la transazione di deploy non viene confermata su un blocco.
  Vengono eseguite queste due istruzioni sia per TrustToken che SPlitwisemanager.
  */
  const token   = await ethers.deployContract("TrustToken");
  await token.waitForDeployment();
  const manager = await ethers.deployContract("SplitwiseManager", [
    await token.getAddress()
  ]);
  await manager.waitForDeployment();

  console.log("▶️  TrustToken  at", await token.getAddress());
  console.log("▶️  SplitwiseMgr at", await manager.getAddress(), "\n");

  ///Funzione che per ogni account membro di un dato gruppo, stampa il suo bilancio.
  async function logBalances(stage: string, groupId:number) {
    console.log(`🏦 Balances ${stage}:`);
    for (const m of members) {
      const bal: bigint = await manager.getNetBalance(groupId, m);
      console.log(`   • ${nameOf[m]}: ${bal}`);
    }
    console.log("");
  }

  /*
  Viene effettuata una transazione da Alice, che crea un gruppo chiamato Pizza Night, indicando come membri bob e carl.
  .connect(alice) crea una nuova connessione che imposta msg.sender = alice.address per tutte le chiamate successive.
  La Transaction Response tx contiene i dati della transazione. tx.wait() sospende l’esecuzione finché la rete non conferma la transazione.
  */
  const tx = await manager
    .connect(alice)
    .createGroup("Pizza Night", [bob.address, carl.address]);
  const receipt = await tx.wait();

  /*
  Prende tutti i log (eventi) dalla receipt, li prova a decodificare, e poi seleziona il 
  primo evento il cui nome sia "GroupCreated", in modo da ottienere l’evento parsato. Dall'eventro estrae il groupID del gruppo.
  */
  const parsed = receipt!.logs
    .map((l) => {
      try { return manager.interface.parseLog(l); }
      catch { return null; }
    })
    .find((e) => e?.name === "GroupCreated")!;
  const groupId = Number(parsed.args.groupId);
  console.log(`🍕  Created group ${groupId} "Pizza Night"\n`);

  ///Alice aggiunge una spesa di 90 divisa in parti uguali tra i membri.
  await (
    await manager.connect(alice).addExpense(
      groupId,
      ethers.parseUnits("90", 0),  // 90 unità virtuali
      alice.address,
      members,
      0,      // SplitType.Equal
      [],
      "PizzaLuigi"
    )
  ).wait();
  console.log("💸  Expense added by Alice: 90 (Equal split)\n");

  ///Viene stampato, ciclando, il grafo dei debiti, chiamando la funzione getDebt per ogni creditore e debitore, e stampando a video
  console.log("🔍 Old Debt Graph (before simplify):");
  for (const payer of members) {
    for (const payee of members) {
      const amt: bigint = await manager.getDebt(groupId, payer, payee);
      if (amt > 0n) {
        console.log(`   • ${nameOf[payer]} ➜ ${nameOf[payee]} : ${amt}`);
      }
    }
  }
  console.log("");

  // Vengono stampati i bilanci prima della semplificazione
  await logBalances("BEFORE simplify",groupId);

  /// Viene semplificato il grafo dei debiti tramite la chiamata simplifyDebts
  await (await manager.connect(alice).simplifyDebts(groupId)).wait();
  console.log("🔄 Debts simplified\n");

  ///Viene ristampato il grafo dei debiti
  console.log("🔍 New Debt Graph (after simplify):");
  for (const payer of members) {
    for (const payee of members) {
      const amt: bigint = await manager.getDebt(groupId, payer, payee);
      if (amt > 0n) {
        console.log(`   • ${nameOf[payer]} ➜ ${nameOf[payee]} : ${amt}`);
      }
    }
  }
  console.log("");





///Carl aggiunge una spesa di 150 (Equal split)
await (
  await manager.connect(carl).addExpense(
    groupId,
    ethers.parseUnits("150", 0),  // 90 unità virtuali
    carl.address,
    members,
    0,      // SplitType.Equal
    [],
    "PizzaVito"
  )
).wait();
console.log("💸  Expense added by Carl: 150 (Equal split)\n");

///Grafo debiti BEFORE simplify
console.log("🔍 Old Debt Graph (before simplify):");
for (const payer of members) {
  for (const payee of members) {
    const amt: bigint = await manager.getDebt(groupId, payer, payee);
    if (amt > 0n) {
      console.log(`   • ${nameOf[payer]} ➜ ${nameOf[payee]} : ${amt}`);
    }
  }
}
console.log("");

// Stampa i net-balance prima di simplify
await logBalances("BEFORE simplify", groupId);

///Chiamata a simplifyDebts
await (await manager.connect(alice).simplifyDebts(groupId)).wait();
console.log("🔄 Debts simplified\n");

///Grafo debiti AFTER simplify
console.log("🔍 New Debt Graph (after simplify):");
for (const payer of members) {
  for (const payee of members) {
    const amt: bigint = await manager.getDebt(groupId, payer, payee);
    if (amt > 0n) {
      console.log(`   • ${nameOf[payer]} ➜ ${nameOf[payee]} : ${amt}`);
    }
  }
}
console.log("");


///Bob aggiunge una spesa di 120 divisa in parti uguali.
await (
  await manager.connect(bob).addExpense(
    groupId,
    ethers.parseUnits("120", 0), 
    bob.address,
    members,
    0,      // SplitType.Equal
    [],
    "PizzaVito"
  )
).wait();
console.log("💸  Expense added by Bob: 120 (Equal split)\n");

///Grafo debiti BEFORE simplify
console.log("🔍 Old Debt Graph (before simplify):");
for (const payer of members) {
  for (const payee of members) {
    const amt: bigint = await manager.getDebt(groupId, payer, payee);
    if (amt > 0n) {
      console.log(`   • ${nameOf[payer]} ➜ ${nameOf[payee]} : ${amt}`);
    }
  }
}
console.log("");

///Stampa i net-balance prima di simplify
await logBalances("BEFORE simplify", groupId);

/// chiamata a simplifyDebts
await (await manager.connect(alice).simplifyDebts(groupId)).wait();
console.log("🔄 Debts simplified\n");

///Grafo debiti AFTER simplify
console.log("🔍 New Debt Graph (after simplify):");
for (const payer of members) {
  for (const payee of members) {
    const amt: bigint = await manager.getDebt(groupId, payer, payee);
    if (amt > 0n) {
      console.log(`   • ${nameOf[payer]} ➜ ${nameOf[payee]} : ${amt}`);
    }
  }
}
console.log("");

/// Creazione di un NUOVO gruppo “Weekend Trip” creato da Alice, includendo Bob e Carl
const txNewGroup = await manager
  .connect(alice)
  .createGroup("Weekend Trip", [bob.address, carl.address]);  
const rcptNewGroup = await txNewGroup.wait();
// Estrazione di groupId dall’evento GroupCreated
  const parsedNew = rcptNewGroup!.logs
    .map((l) => {
      try { return manager.interface.parseLog(l); }
      catch { return null; }
    })
    .find((e) => e?.name === "GroupCreated")!;
  const groupId2 = Number(parsedNew.args.groupId);
  console.log(`🛫  Created group ${groupId2} "Weekend Trip"\n`);

  /// Alice paga 60 unità, divise in parti uguali tra i 3 membri
  await (
    await manager.connect(alice).addExpense(
      groupId2,                      
      ethers.parseUnits("60", 0),    
      alice.address,                 
      members,                       
      0,                        
      [],                         
      "Fuel"                  
    )
  ).wait();
  console.log("💸  Expense Equal added by Alice: 60\n");

  
///Grafo debiti BEFORE simplify
console.log("🔍 Old Debt Graph (before simplify):");
for (const payer of members) {
  for (const payee of members) {
    const amt: bigint = await manager.getDebt(groupId2, payer, payee);
    if (amt > 0n) {
      console.log(`   • ${nameOf[payer]} ➜ ${nameOf[payee]} : ${amt}`);
    }
  }
}
console.log("");

///Stampa i net-balance prima di simplify
await logBalances("BEFORE simplify", groupId2);

///Chiamata a simplifyDebts
await (await manager.connect(alice).simplifyDebts(groupId2)).wait();
console.log("🔄 Debts simplified\n");

///Grafo debiti AFTER simplify
console.log("🔍 New Debt Graph (after simplify):");
for (const payer of members) {
  for (const payee of members) {
    const amt: bigint = await manager.getDebt(groupId2, payer, payee);
    if (amt > 0n) {
      console.log(`   • ${nameOf[payer]} ➜ ${nameOf[payee]} : ${amt}`);
    }
  }
}
console.log("");

// Bob paga 90 unità, con quote esatte [30, 40, 20] per alice, bob, carl
  await (
    await manager.connect(bob).addExpense(
      groupId2,
      ethers.parseUnits("90", 0),    // importo totale = 90
      bob.address,                   // chi ha pagato
      members,
      1,                              // SplitType.Exact
      [30, 40, 20],                  // quote exact per ciascun membro
      "Hotel"
    )
  ).wait();
  console.log("💸  Expense Exact added by Bob: 90 [30,40,20]\n");

 
///Grafo debiti BEFORE simplify
console.log("🔍 Old Debt Graph (before simplify):");
for (const payer of members) {
  for (const payee of members) {
    const amt: bigint = await manager.getDebt(groupId2, payer, payee);
    if (amt > 0n) {
      console.log(`   • ${nameOf[payer]} ➜ ${nameOf[payee]} : ${amt}`);
    }
  }
}
console.log("");

///Stampa i net-balance prima di simplify
await logBalances("BEFORE simplify", groupId2);

///Chiamata a simplifyDebts
await (await manager.connect(alice).simplifyDebts(groupId2)).wait();
console.log("🔄 Debts simplified\n");

///Grafo debiti AFTER simplify
console.log("🔍 New Debt Graph (after simplify):");
for (const payer of members) {
  for (const payee of members) {
    const amt: bigint = await manager.getDebt(groupId2, payer, payee);
    if (amt > 0n) {
      console.log(`   • ${nameOf[payer]} ➜ ${nameOf[payee]} : ${amt}`);
    }
  }
}
console.log("");

///Carl paga 100 unità, con percentuali [2000,3000,5000] ≡ 20%,30%,50%
  await (
    await manager.connect(carl).addExpense(
      groupId2,
      ethers.parseUnits("100", 0),   
      carl.address,                 
      members,
      2,                             
      [2000, 3000, 5000],           
      "Food"
    )
  ).wait();
  console.log("💸  Expense Percentage added by Carl: 100 [20%,30%,50%]\n");

   
///Grafo debiti BEFORE simplify
console.log("🔍 Old Debt Graph (before simplify):");
for (const payer of members) {
  for (const payee of members) {
    const amt: bigint = await manager.getDebt(groupId2, payer, payee);
    if (amt > 0n) {
      console.log(`   • ${nameOf[payer]} ➜ ${nameOf[payee]} : ${amt}`);
    }
  }
}
console.log("");

///Stampa i net-balance prima di simplify
await logBalances("BEFORE simplify", groupId2);

/// Chiamata a simplifyDebts
await (await manager.connect(alice).simplifyDebts(groupId2)).wait();
console.log("🔄 Debts simplified\n");

/// Grafo debiti AFTER simplify
console.log("🔍 New Debt Graph (after simplify):");
for (const payer of members) {
  for (const payee of members) {
    const amt: bigint = await manager.getDebt(groupId2, payer, payee);
    if (amt > 0n) {
      console.log(`   • ${nameOf[payer]} ➜ ${nameOf[payee]} : ${amt}`);
    }
  }
}
console.log("");

  console.log("✅ Demo completa!");
}

main().catch(console.error);
