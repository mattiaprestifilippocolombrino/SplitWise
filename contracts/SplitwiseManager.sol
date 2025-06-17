// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "./TrustToken.sol";

/// Tipologie di suddivisione di spesa
enum SplitType {
    Equal,       // parti uguali
    Exact,       // importi esatti 
    Percentage   // percentuali
}

/// Struttura dati che rappresenta un gruppo 
struct Group {
    string groupName;       // nome  del gruppo
    address[] memberList;      // elenco degli indirizzi dei membri
    mapping(address => bool) isMember;    // mapping di lookup membership
    mapping(address => int256) netBalance;  // mapping di saldo di ciascun membro
    mapping(address => mapping(address => uint256)) debtGraph; // grafo del debito: debtGraph[debitor][creditor] = debito
}

contract SplitwiseManager {
    TrustToken public immutable trustToken;       // riferimento al token ERC-20
    uint256 public nextGroupId;        // counter degli id dei gruppi
    mapping(uint256 => Group) private groups;     // mapping che tiene traccia dei gruppi gestiti dal contratto

    ///Eventi emessi dal contratto
    event GroupCreated(uint256 indexed groupId, string groupName);
    event MemberJoined(uint256 indexed groupId, address member);
    event ExpenseAdded(uint256 indexed groupId, string description, uint256 totalAmount);
    event DebtsSimplified(uint256 indexed groupId);
    event DebtSettled(uint256 indexed groupId, address payer, address payee, uint256 amount);

    ///Errori lanciati
    error NotGroupMember();
    error InvalidParameters();

    ///Decorator che restringe l’accesso solo ai membri del gruppo
    modifier onlyGroupMember(uint256 groupId) {
        if (!groups[groupId].isMember[msg.sender]) revert NotGroupMember();
        _;
    }

    /// Costruttore che assegna al riferimento trustToken l'indirizzo del contratto TrustToken deployato 
    constructor(address tokenAddress) {
        trustToken = TrustToken(tokenAddress);
    }

    ///FUNZIONI DI UTILITY chiamabili dall'esterno, che non modificano lo stato della blockchain
    ///Restituisce il saldo di un dato utente di un dato gruppo
    function getNetBalance(uint256 groupId, address user) external view returns (int256) {
        return groups[groupId].netBalance[user];
    }

    ///Restituisce il debito registrato da debitor verso creditor in un gruppo
    function getDebt(uint256 groupId, address debitor, address creditor) external view returns (uint256) {
        return groups[groupId].debtGraph[debitor][creditor];
    }

    ///Restituisce la lista degli indirizzi membri di un gruppo
    function getGroupMembers(uint256 groupId) external view returns (address[] memory) {
        return groups[groupId].memberList;
    }


    ///INTERNAL UTILITY. Aggiunge al gruppo un nuovo membro, se non gia presente
    function _addMemberToGroup(Group storage groupData, address newMember) internal {
        if (!groupData.isMember[newMember]) {
            groupData.isMember[newMember] = true;
            groupData.memberList.push(newMember);
        }
    }

    ///Funzione che crea un nuovo gruppo e ne restituisce l’id. Aggiunge il chiamante e i membri forniti nel gruppo.
    /// @param groupName nome del gruppo
    /// @param initialMembers elenco di membri da aggiungere
    function createGroup(string calldata groupName, address[] calldata initialMembers) external returns (uint256 groupId)
    {
        groupId = nextGroupId++;
        Group storage newGroup = groups[groupId];
        newGroup.groupName = groupName;
        _addMemberToGroup(newGroup, msg.sender);
        for (uint256 i = 0; i < initialMembers.length; ++i) {
            _addMemberToGroup(newGroup, initialMembers[i]);
        }
        emit GroupCreated(groupId, groupName);
    }

    /// Funzione che permette ad un utente esterno di unirsi ad un gruppo
    function joinGroup(uint256 groupId) external {
        _addMemberToGroup(groups[groupId], msg.sender);
        emit MemberJoined(groupId, msg.sender);
    }



    /// @param groupId          id del gruppo
    /// @param totalAmount      importo pagato
    /// @param paidBy           indirizzo che ha pagato
    /// @param participants     elenco di partecipanti allo split
    /// @param splitType        tipo di split (Equal/Exact/Percentage)
    /// @param splitData        dati ausiliari per lo split
    /// @param description      descrizione testuale
    /*Funzione che registra una spesa nel gruppo. Viene applicato il decorator onlyGroupMember. 
    Viene effettuato un check se la spesa è diverso da 0, se sono presenti partecipanti e se l'indirizzo pagante è un membro del gruppo.
    Vengono calcolate (in memoria) le quote di ciascun partecipante in base al tipo di split passato. Per ogni partecipante,
    diminuisce il saldo netto della quota da pagare, incrementa il saldo di chi ha pagato e aggiunge il debito nel grafo dei debiti tra l'utente e colui che ha pagato.  
    */
    function addExpense(uint256 groupId, uint256 totalAmount, address paidBy, address[] calldata participants,
        SplitType splitType, uint256[] calldata splitData, string calldata description)
        external onlyGroupMember(groupId)
    {
        Group storage groupData = groups[groupId];
        if ( totalAmount == 0 || participants.length == 0 || !groupData.isMember[paidBy]) {
            revert InvalidParameters();
        }
        // calcola le quote di ciascun partecipante
        uint256[] memory individualShares = _computeShares(totalAmount, participants.length, splitType, splitData);

        // Per ogni partecipante, aggiorna netBalance e debtGraph
        for (uint256 i = 0; i < participants.length; ++i) {
            address participantAddr = participants[i];
            // salta chi ha pagato
            if (participantAddr == paidBy) {
                continue;
            }
            int256 shareAsInt = int256(individualShares[i]);
            groupData.netBalance[participantAddr] -= shareAsInt;
            groupData.netBalance[paidBy] += shareAsInt;
            groupData.debtGraph[participantAddr][paidBy] += individualShares[i];
        }
        emit ExpenseAdded(groupId, description, totalAmount);
    }

    /*Funzione che in base al tipo di split e alle eventuali percentuali o quote esatte, calcola l'array di quote dovute da un utente.
      Se il tipo di split è in parti uguali, divide l'importo per il numero di partecipanti. 
      Se viene indicata divisione esatta, per ogni partecipante assegna dai dati ausiliari la quota esatta, e infine controlla che la somma delle quote sia uguale all'importo dovuto.
      Se il tipo di split è in percentuali, calcola la quota per utente come totale * percentuale/10000. Si usa 10000 e non 100 in modo da rappresentare in scala anche i numeri decimali in solidity, come 100.00.
      Le percentuali dei vari utenti vengono sommate. Si controlla che la somma sia uguale a 10000.
    */
    function _computeShares(uint256 totalAmount, uint256 numberOfParticipants, SplitType splitType, uint256[] calldata auxData)
             internal pure returns (uint256[] memory shares)
    {
        shares = new uint256[](numberOfParticipants);
        // divisione in parti uguali
        if (splitType == SplitType.Equal) {
            uint256 equalShare = totalAmount / numberOfParticipants;
            for (uint256 i = 0; i < numberOfParticipants; ++i) {
                shares[i] = equalShare;
            }
        }
        // divisione esatta
        else if (splitType == SplitType.Exact) {
            require(auxData.length == numberOfParticipants, "Exact split: wrong length");
            uint256 sum = 0;
            for (uint256 i = 0; i < numberOfParticipants; ++i) {
                shares[i] = auxData[i];
                sum += auxData[i];
            }
            require(sum == totalAmount, "Exact split: sum mismatch");
        }
        else if (splitType == SplitType.Percentage) {
            require(auxData.length == numberOfParticipants, "Percentage split: wrong length");
            uint256 accumulatedPerc = 0;
            for (uint256 i = 0; i < numberOfParticipants; ++i) {
                accumulatedPerc += auxData[i];
                // 100% ≡ 10000
                shares[i] = (totalAmount * auxData[i]) / 10000;
            }
            require(accumulatedPerc == 10000, "Percentage split: total != 100%");
        }
        else {
            revert InvalidParameters();
        }

        return shares;
    }


    /*Funzione che registra il pagamento on-chain di un debito usando token ERC-20.
      Viene preso l'importo dal chiamante al creditore dal grafo dei debiti. Viene controllato se l'importo sia maggiore di 0 e inferiore uguale al debito registrato.
      Viene richiesto di trasferire l'importo dal debitore al creditore. Subito dopo viene effettutata la require:se il trasferimento è andato a buon fine continua, altrimenti revert.
      Viene aggiornato il grafo del debito e i rispettivi bilanci.
    */
    function settleDebt(uint256 groupId, address creditor, uint256 paymentAmount)
        external onlyGroupMember(groupId)
    {
        Group storage groupData = groups[groupId];
        uint256 registeredDebt = groupData.debtGraph[msg.sender][creditor];
        require(paymentAmount > 0 && paymentAmount <= registeredDebt, "Invalid payment");
        // trasferisco i token
        // aggiorno grafo e saldi netti
        groupData.debtGraph[msg.sender][creditor] -= paymentAmount;
        groupData.netBalance[msg.sender] += int256(paymentAmount);
        groupData.netBalance[creditor] -= int256(paymentAmount);
        require(trustToken.transferFrom(msg.sender, creditor, paymentAmount), "Token transfer failed");
        emit DebtSettled(groupId, msg.sender, creditor, paymentAmount);
    }


    /* 
    Funzione che semplifica il grafo del debito secondo l'algoritmo greedy.
    Vengono creati 4 array: un array dei creditori affiancati da un array con i corrispettivi saldi, e un array dei debitori affiancati dai loro corrispettivi saldi.
    Ogni membro viene inserito nell'array appropriato con corrispettivo bilancio. I due (4) array vengono ordinati in modo decrescente.
    Viene azzerato il debtGraph. Effettua un ciclo fino ad arrivare alla lunghezza dei due array, indicizzato da due indici per i rispettivi array, credIndex e debtIndex.
    Ad ogni iterazione, viene scelto come importo il minore tra i saldi del maggiore creditore e il maggiore debitore, e viene costruito un arco nel grafo dei debiti tra essi.
    Viene decrementata la balance dei due array interni creditorBalance e debtorBalance (no storage). Nel caso in cui il saldo del creditore o del debitore si azzeri, l'indice nell'array creditor o debitor viene incrementato, avanzando. 
    Il ciclo poi viene iterato, finchè non si esauriscono gli elementi di entrambi gli array.
    */
    function simplifyDebts(uint256 groupId) external onlyGroupMember(groupId) {
        Group storage groupData = groups[groupId];
        uint256 memberCount = groupData.memberList.length;
        // separa creditori e debitori
        address[] memory creditorAddresses = new address[](memberCount);
        int256[] memory creditorBalances  = new int256[](memberCount);
        uint256 creditorCount;

        address[] memory debtorAddresses  = new address[](memberCount);
        int256[] memory debtorBalances   = new int256[](memberCount);
        uint256 debtorCount;

        for (uint256 i = 0; i < memberCount; ++i) {
            address memberAddr = groupData.memberList[i];
            int256 balance = groupData.netBalance[memberAddr];
            if (balance > 0) {
                creditorAddresses[creditorCount] = memberAddr;
                creditorBalances[creditorCount]  = balance;
                ++creditorCount;
            } else if (balance < 0) {
                debtorAddresses[debtorCount] = memberAddr;
                debtorBalances[debtorCount] = -balance;
                ++debtorCount;
            }
        }

        // ordina in modo decrescente
        _sortDescending(creditorAddresses, creditorBalances, creditorCount);
        _sortDescending(debtorAddresses,   debtorBalances,   debtorCount);

        // azzera il debtGraph precedente
        for (uint256 i = 0; i < memberCount; ++i) {
            address fromAddr = groupData.memberList[i];
            for (uint256 j = 0; j < memberCount; ++j) {
                address toAddr = groupData.memberList[j];
                groupData.debtGraph[fromAddr][toAddr] = 0;
            }
        }

        // Ciclo greedy
        uint256 credIndex = 0;
        uint256 debtIndex = 0;
        while (credIndex < creditorCount && debtIndex < debtorCount) {
            uint256 amountToPay = creditorBalances[credIndex] < debtorBalances[debtIndex]
                                ? uint256(creditorBalances[credIndex])
                                : uint256(debtorBalances[debtIndex]);

            address creditor = creditorAddresses[credIndex];
            address debtor   = debtorAddresses[debtIndex];
            // ricostruisce l’arco
            groupData.debtGraph[debtor][creditor] = amountToPay;
            // decrementa i buffer
            creditorBalances[credIndex] -= int256(amountToPay);
            debtorBalances[debtIndex]   -= int256(amountToPay);
            // avanza gli indici se sono saldati
            if (creditorBalances[credIndex] == 0) ++credIndex;
            if (debtorBalances[debtIndex]   == 0) ++debtIndex;
        }
        emit DebtsSimplified(groupId);
    }


    /// Insertion-sort decrescente su array paralleli (addr/values)
    function _sortDescending(address[] memory addressArray, int256[] memory valueArray, uint256 activeLength) private pure {
        for (uint256 i = 1; i < activeLength; ++i) {
            address keyAddress = addressArray[i];
            int256  keyValue = valueArray[i];
            uint256 j = i;
            while (j > 0 && valueArray[j - 1] < keyValue) {
                addressArray[j] = addressArray[j - 1];
                valueArray[j] = valueArray[j - 1];
                --j;
            }
            addressArray[j] = keyAddress;
            valueArray[j] = keyValue;
        }
    }
}
