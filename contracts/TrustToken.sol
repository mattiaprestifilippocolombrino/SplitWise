// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
//Implementazione di un fungible token ERC 20
contract TrustToken is ERC20 {
    /// prezzo in wei per coniare 1 unità di token
    uint256 public constant TOKENPRICE = 1;

    ///Il costruttore inizializza nome e simbolo
    constructor() ERC20("TrustToken", "TTK") {}

    ///funzione usata per coniare nuovi token chiamando _mint(); il chiamante riceve tanti token quante sono i wei inviati
    function mint() external payable {
        // Occorre inviare almeno 1 wei
        require(msg.value >= TOKENPRICE, "Ether insufficiente per acquistare token");
        uint256 amount = msg.value / TOKENPRICE;    //Numero di token da coniare
        require(amount > 0, "Mint: amount = 0");
        // _mint in ERC20 richiede quantità comprensive dei 18 decimali, quindi si moltiplica amount * 10^decimals()
        _mint(msg.sender, amount * 10 ** decimals());
    }
}
