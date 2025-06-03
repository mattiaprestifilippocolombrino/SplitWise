// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Import del contratto ERC20 di OpenZeppelin
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

///TrustToken – ERC-20 dove 1 unità di token = 1 wei
contract TrustToken is ERC20 {
    /// prezzo in wei per coniare 1 unità di token
    uint256 public constant TOKENPRICE = 1;

    ///Il costruttore inizializza nome e simbolo via ERC20(name, symbol)
    constructor() ERC20("TrustToken", "TTK") {}

    ///funzione che chiama mint() inviando ETH; ricevi tanti token quante sono le wei inviate
    function mint() external payable {
        // msg.value è la quantità di wei inviata. Occorre inviare almeno 1 wei.
        require(msg.value >= TOKENPRICE, "Ether insufficiente per acquistare token");

        // calcolo del numero di token da coniare
        uint256 amount = msg.value / TOKENPRICE;
        require(amount > 0, "Mint: amount = 0");

        // _mint in ERC20 richiede quantità comprensive dei 18 decimali, quindi si moltiplica amount * 10^decimals()
        _mint(msg.sender, amount * 10 ** decimals());
    }
}
