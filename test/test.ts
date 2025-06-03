import { expect } from "chai";                    
import { ethers } from "hardhat";   
import type {                                          // tipi TypeScript generati da TypeChain
  TrustToken,
  TrustToken__factory,
  SplitwiseManager,
  SplitwiseManager__factory
} from "../typechain-types";

///Inizia la suite di test
///describe apre un gruppo di test afferenti allo stesso scenario
describe("TrustToken + SplitwiseManager Integration", function () { 
  //Le factory sono oggetti che ti permettono di deployare nuove istanze dei contratti in modo tipizzato.
  let trustTokenFactory: TrustToken__factory;               // factory per deployare TrustToken
  let managerFactory: SplitwiseManager__factory;            // factory per deployare SplitwiseManager

  //token conterrà l’istanza deployata di TrustToken, mentre manager conterrà l’istanza deployata di SplitwiseManager.
  let token: TrustToken;                                    
  let manager: SplitwiseManager;                           

  ///Vengono dichiarate quattro variabili dove poi verranno assegnati gli account di test. Simulano gli utenti nelle chiamate dei contratti
  let owner: any;                                           
  let alice: any;                                           
  let bob: any;                                             
  let carol: any;                                           

  ///La call before viene eseguito una sola volta, prima di qualsiasi it(...) all’interno di questo describe.
  // Recupera i 4 account di prova tramite ethers.getSigners() e recupera la factory di trustToken e SplitWiseManager tramite ethers.getContractFactory,
  /// assegnandoli alle variabili precedentemente dichiarate.
  before(async () => {                                      // viene eseguito una volta prima di tutti i test
    [owner, alice, bob, carol] = await ethers.getSigners(); // recupera 4 account di prova

    trustTokenFactory = (await ethers.getContractFactory(   // ottiene la factory per TrustToken
      "TrustToken"
    )) as TrustToken__factory;

    managerFactory = (await ethers.getContractFactory(      // ottiene la factory per SplitwiseManager
      "SplitwiseManager"
    )) as SplitwiseManager__factory;
  });

 ///Sottogruppo di test relativi a TrustToken
  describe("TrustToken", () => {                           
    ///Prima di ogni test di TrustToken, viene deployata una nuova istanza di TrustToken
    beforeEach(async () => {                               
      token = await trustTokenFactory.deploy();             
      await token.waitForDeployment();                      // attende la conferma del deploy
    });


    /*
    it definisce un singolo case test, spiegando cosa deve fare.
    La transazione deve fallire (revert) se il valore inviato è sotto il prezzo minimo.
    Il test si aspetta che, se chiamata mint() con un importo di TOKENPRICE - 1 = 0, viene effettuato un revert con il messaggio presente nella stringa
    */  
    it("reverts if you send less than TOKENPRICE", async () => {  
      const price = await token.TOKENPRICE();               
      await expect(                                         
        token.connect(owner).mint({ value: price - 1n })    
      ).to.be.revertedWith("Ether insufficiente per acquistare token"); 
    });

    /*
    Testa l'invio a mint() di un valore corretto (3 token), aspettandosi che il balance in token dell'utente sia uguale al balance coniato.
    */
    it("mints correct amount of tokens", async () => {      
      const price = await token.TOKENPRICE();           
      await token.connect(owner).mint({ value: price * 3n }); 
      const balance = await token.balanceOf(owner.address); 
      expect(balance).to.equal(3n * 10n ** 18n);         
    });
  });

  
  ///Vengono testati i metodi di SplitwiseManager
  describe("SplitwiseManager", () => {          
    //Vengono coniati 1000 token per account
    const INITIAL_TOKENS = 1000n;                          

    ///Prima di ogni test, viene deployato TrustToken, e vengono aggiunti 1000 token per ciascun account.
    ///Viene deployato splitwisemanager, passando l'indirizzo del TrustToken. Viene infine autorizzato lo splitwisemanager a spendere da qualsiasi account qualsiasi somma di token tramite approve()
    beforeEach(async () => {                               
      token = await trustTokenFactory.deploy();             
      await token.waitForDeployment();                      
      const price = await token.TOKENPRICE();              

      for (const account of [owner, alice, bob, carol]) {   
        await token.connect(account).mint({                 
          value: price * INITIAL_TOKENS
        });
      }


      manager = await managerFactory.deploy(              
        await token.getAddress()                            // passandogli l’indirizzo del TrustToken
      );
      await manager.waitForDeployment();                   

      // Approve allowance illimitato
      for (const account of [owner, alice, bob, carol]) {   
        await token                                       
          .connect(account)                               
          .approve(                                      
            await manager.getAddress(),                   
            ethers.MaxUint256                             
          );
      }
    });

    //Test che effettua l'intero flusso create, join, settle, simplify.
    // Crea un gruppo chiamato vacanze e si aspetta che venga emesso l'evento GroupCreated con groupId = 0 e nome = "Vacanze".
    it("full flow: create/join/addExpense/settle/simplify", async () => { 
      await expect(                                         
        manager.createGroup("Vacanze", [                   
          alice.address,
          bob.address
        ])
      )
        .to.emit(manager, "GroupCreated")                  
        .withArgs(0, "Vacanze");                           

      ///Carol effettua il join al gruppo 0, e il test si aspetta che venga emesso l'evento MemberJoined con parametri (0, carol).
      await expect(                                         
        manager.connect(carol).joinGroup(0)                
      )
        .to.emit(manager, "MemberJoined")               
        .withArgs(0, carol.address);      

      ///Viene aggiunta una spesa di 30000, divisa in modo uguale da owner, alice e bob. Il test si aspetta l'emisssione dell'evento ExpenseAdded con arg (0, “Cena”, 30000).  
      await expect(                                         
        manager.addExpense(                                 
          0,                                                
          30000,                                            
          owner.address,                                    
          [owner.address, alice.address, bob.address],     
          0,                                                
          [],                                              
          "Cena"                                            
        )
      )
        .to.emit(manager, "ExpenseAdded")                   // emetta ExpenseAdded
        .withArgs(0, "Cena", 30000);                        // con (0, “Cena”, 30000)

      ///Viene verificato il saldo dopo la spesa di alice, bob e owner.  
      expect(await manager.getNetBalance(0, alice.address)) 
        .to.equal(-10000);                                  
      expect(await manager.getNetBalance(0, bob.address))   
        .to.equal(-10000);                                 
      expect(await manager.getNetBalance(0, owner.address)) 
        .to.equal(20000);                                  

      ///Il test asserisce che alice saldi 5000 token a owner e emetta l'evento DebtSettled con (0, alice, owner, 5000).
      ///Controlla poi il debito residuo tra alice e owner. 
      await expect(                                         
        manager.connect(alice).settleDebt(             
          0,
          owner.address,
          5000
        )
      )
        .to.emit(manager, "DebtSettled")                  
        .withArgs(0, alice.address, owner.address, 5000); 

      expect(                                             
        await manager.getDebt(0, alice.address, owner.address)
      ).to.equal(5000);                                   

      ///Il test asserisce che la semplificazione del debito porta l'emissione dell'evento DebtsSimplified, e dopo la sempòificazione rimanga un debito di 5000 tra alice e owner.
      await expect(                                         
        manager.simplifyDebts(0)                            
      )
        .to.emit(manager, "DebtsSimplified")               
        .withArgs(0);                                     

      expect(                                               
        await manager.getDebt(0, alice.address, owner.address)
      ).to.equal(5000);                                    
    });

    ///Test che crea un gruppo chiamato ExactTest, divide la spesa in quote esatte e verifica i nuovi bilanci degli account.
    it("Exact split and Percentage split", async () => {    
      // ---- Exact
      await manager.createGroup("ExactTest", []);          
      await manager.addExpense(                           
        0,
        30000,
        owner.address,
        [owner.address, alice.address, bob.address],
        1,                                                 
        [10000, 15000, 5000],                             
        "Exact"
      );
      expect(await manager.getNetBalance(0, owner.address)) // owner riceve 15000+5000
        .to.equal(20000);
      expect(await manager.getNetBalance(0, alice.address)) 
        .to.equal(-15000);
      expect(await manager.getNetBalance(0, bob.address))   
        .to.equal(-5000);

///Test che crea un gruppo chiamato PercTest, divide la spesa in percentuale e verifica i nuovi bilanci degli account.
  
      await manager.createGroup("PercTest", []);           
      await manager.addExpense(                             // aggiungiamo spesa 30/50/20
        1,
        30000,
        owner.address,
        [owner.address, alice.address, bob.address],
        2,                                                  // SplitType.Percentage
        [3000, 5000, 2000],                                 // 30%,50%,20%
        "Percent"
      );
      expect(await manager.getNetBalance(1, owner.address)) // owner riceve 15000+6000
        .to.equal(21000);
      expect(await manager.getNetBalance(1, alice.address)) // alice deve -15000
        .to.equal(-15000);
      expect(await manager.getNetBalance(1, bob.address))   // bob deve -6000
        .to.equal(-6000);
    });


    // SEZIONE di Error handling dei test, dove si verificano i revert
   describe("Error handling", () => {               
      it("reverts if a non-member calls a member-only function", async () => {
        // owner crea il gruppo 0, ma carol non è membro
        await manager.createGroup("Test", []);
        await expect(
          manager.connect(carol).simplifyDebts(0)            // carol prova a semplificare
        ).to.be.revertedWithCustomError(manager, "NotGroupMember"); // custom error
      });

      // Test che crea un gruppo e owner aggiunge una spesa pari a zero, aspettandosi un errore InvalidParameters.
      it("reverts addExpense with totalAmount == 0", async () => {
        await manager.createGroup("TestZero", []);           // creiamo gruppo
        await expect(
          manager.addExpense(                                // chiamiamo addExpense con amount=0
            0,
            0,                                               // totalAmount = 0
            owner.address,
            [owner.address],
            0,
            [],
            "Zero"
          )
        ).to.be.revertedWithCustomError(manager, "InvalidParameters"); // custom error
      });

  // Test che crea un gruppo e un account non membro aggiunge una spesa diversa da zero, aspettandosi un errore InvalidParameters.
      it("reverts addExpense if paidBy is not a group member", async () => {
        await manager.createGroup("BadPaidBy", []);          // creiamo gruppo
        await expect(
          manager.addExpense(                                // paidBy = carol (non membro)
            0,
            1000,
            carol.address,
            [owner.address, alice.address],
            0,
            [],
            "BadPaidBy"
          )
        ).to.be.revertedWithCustomError(manager, "InvalidParameters"); // custom error
      });

// Test che crea un gruppo includendo un membro Alice. Owner aggiunge una spesa pari a 200, 
// e Alice prova a effettuare un pagamento ad owner pari a 0, aspettandosi InvalidPayment.
//Viene testato poi un pagamento superiore.
      it("reverts settleDebt when amount is 0 or exceeds debt", async () => {
        // preparo scenario con debito alice→owner di 100
        await manager.createGroup("DebtTest", [alice.address]);
        await manager.addExpense(
          0,
          200,
          owner.address,
          [owner.address, alice.address],
          0,
          [],
          "Small"
        ); // spesa 200 → debito = 100

        // test amount = 0
        await expect(
          manager.connect(alice).settleDebt(0, owner.address, 0)
        ).to.be.revertedWith("Invalid payment");           

        await expect(
          manager.connect(alice).settleDebt(0, owner.address, 150)
        ).to.be.revertedWith("Invalid payment");            
      });
    });
  });
});
