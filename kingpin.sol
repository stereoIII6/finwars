// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

// Game token
contract KingToken is ERC20, Ownable {
    constructor() ERC20("Kingpin Token", "KING") {
        _mint(msg.sender, 1000000 * 10**decimals());
    }
}

// Player NFT
contract PlayerNFT is ERC721, Ownable {
    using Counters for Counters.Counter;
    Counters.Counter private _tokenIds;
    
    struct PlayerAttributes {
        uint8 speed;
        uint8 charisma;
        uint8 inventory;
        uint8 stealth;
    }
    
    mapping(uint256 => PlayerAttributes) public playerAttributes;
    
    constructor() ERC721("Crypto Kingpin Player", "PLAYER") {}
    
    function mintPlayer(address player) public onlyOwner returns (uint256) {
        _tokenIds.increment();
        uint256 newPlayerId = _tokenIds.current();
        _safeMint(player, newPlayerId);
        
        // Generate random attributes
        playerAttributes[newPlayerId] = PlayerAttributes(
            uint8(random(100)),
            uint8(random(100)),
            uint8(random(100)),
            uint8(random(100))
        );
        
        return newPlayerId;
    }
    
    function random(uint number) private view returns(uint) {
        return uint(keccak256(abi.encodePacked(block.timestamp, block.difficulty, msg.sender))) % number;
    }
}

// Main game contract
contract CryptoKingpin is Ownable {
    using Counters for Counters.Counter;
    
    KingToken public kingToken;
    PlayerNFT public playerNFT;
    
    // Game map
    uint8 public constant MAP_SIZE = 10;
    
    // Districts
    enum District {
        FINANCIAL,
        TECH_HUB,
        BLACK_MARKET,
        RESIDENTIAL,
        INDUSTRIAL,
        DOCKS,
        DOWNTOWN,
        OUTSKIRTS
    }
    
    struct DistrictData {
        string name;
        uint8 riskLevel;
        uint8 policePresence;
        bool active;
    }
    
    mapping(District => DistrictData) public districts;
    
    // Assets
    struct Asset {
        string name;
        uint256 basePrice;
        uint8 volatility;
        bool isContraband;
    }
    
    mapping(uint8 => Asset) public assets;
    uint8 public assetCount;
    
    // Price modifier for each district and asset
    mapping(District => mapping(uint8 => int8)) public priceModifiers;
    
    // Player game state
    struct PlayerState {
        uint256 playerId;
        District currentDistrict;
        uint8 actionPoints;
        uint256 lastActionTime;
        mapping(uint8 => uint256) inventory;
    }
    
    mapping(address => PlayerState) public players;
    mapping(address => bool) public activePlayers;
    
    // Events
    event PlayerMoved(address player, District from, District to);
    event AssetTraded(address player, uint8 assetId, bool isBuy, uint256 amount, uint256 price);
    event EncounterOccurred(address player, string encounterType);
    
    constructor(address _kingToken, address _playerNFT) {
        kingToken = KingToken(_kingToken);
        playerNFT = PlayerNFT(_playerNFT);
        
        // Initialize districts
        districts[District.FINANCIAL] = DistrictData("Financial District", 2, 8, true);
        districts[District.TECH_HUB] = DistrictData("Tech Hub", 3, 6, true);
        districts[District.BLACK_MARKET] = DistrictData("Black Market", 8, 2, true);
        districts[District.RESIDENTIAL] = DistrictData("Residential Area", 4, 5, true);
        districts[District.INDUSTRIAL] = DistrictData("Industrial Zone", 6, 3, true);
        districts[District.DOCKS] = DistrictData("Docks", 7, 4, true);
        districts[District.DOWNTOWN] = DistrictData("Downtown", 5, 7, true);
        districts[District.OUTSKIRTS] = DistrictData("Outskirts", 6, 1, true);
        
        // Initialize assets
        _addAsset("Crypto Mining Rig", 5000, 5, false);
        _addAsset("NFT Artwork", 2000, 8, false);
        _addAsset("Smart Contract", 3000, 6, false);
        _addAsset("Digital Identity", 1000, 3, false);
        _addAsset("Hacked Data", 8000, 10, true);
        _addAsset("Bootleg Hardware", 4000, 7, true);
        _addAsset("Token Whitelist", 10000, 9, false);
        _addAsset("Encrypted Keys", 7000, 8, true);
        
        // Set price modifiers
        _setPriceModifier(District.FINANCIAL, 0, 2);  // Mining rigs more expensive
        _setPriceModifier(District.TECH_HUB, 2, -3);  // Smart contracts cheaper
        _setPriceModifier(District.BLACK_MARKET, 4, -5);  // Hacked data cheaper
        _setPriceModifier(District.DOCKS, 5, -4);  // Bootleg hardware cheaper
    }
    
    function _addAsset(string memory name, uint256 basePrice, uint8 volatility, bool isContraband) private {
        assets[assetCount] = Asset(name, basePrice, volatility, isContraband);
        assetCount++;
    }
    
    function _setPriceModifier(District district, uint8 assetId, int8 modifier) private {
        priceModifiers[district][assetId] = modifier;
    }
    
    // Player registration
    function registerPlayer(uint256 playerId) public {
        require(playerNFT.ownerOf(playerId) == msg.sender, "Must own the player NFT");
        require(!activePlayers[msg.sender], "Already registered");
        
        PlayerState storage newPlayer = players[msg.sender];
        newPlayer.playerId = playerId;
        newPlayer.currentDistrict = District.FINANCIAL;
        newPlayer.actionPoints = 10;
        newPlayer.lastActionTime = block.timestamp;
        
        activePlayers[msg.sender] = true;
    }
    
    // Game actions
    function moveToDistrict(District destination) public {
        require(activePlayers[msg.sender], "Player not active");
        require(districts[destination].active, "District not active");
        require(players[msg.sender].actionPoints >= 1, "Not enough action points");
        
        District currentDistrict = players[msg.sender].currentDistrict;
        players[msg.sender].currentDistrict = destination;
        players[msg.sender].actionPoints--;
        
        // Trigger random encounter based on district risk
        uint8 riskLevel = districts[destination].riskLevel;
        if (random(10) < riskLevel) {
            triggerEncounter(msg.sender);
        }
        
        emit PlayerMoved(msg.sender, currentDistrict, destination);
    }
    
    function buyAsset(uint8 assetId, uint256 amount) public {
        require(activePlayers[msg.sender], "Player not active");
        require(assetId < assetCount, "Invalid asset");
        require(players[msg.sender].actionPoints >= 1, "Not enough action points");
        
        uint256 price = getAssetPrice(players[msg.sender].currentDistrict, assetId);
        uint256 totalCost = price * amount;
        
        require(kingToken.allowance(msg.sender, address(this)) >= totalCost, "Insufficient allowance");
        
        kingToken.transferFrom(msg.sender, address(this), totalCost);
        players[msg.sender].inventory[assetId] += amount;
        players[msg.sender].actionPoints--;
        
        emit AssetTraded(msg.sender, assetId, true, amount, price);
    }
    
    function sellAsset(uint8 assetId, uint256 amount) public {
        require(activePlayers[msg.sender], "Player not active");
        require(assetId < assetCount, "Invalid asset");
        require(players[msg.sender].inventory[assetId] >= amount, "Not enough assets");
        require(players[msg.sender].actionPoints >= 1, "Not enough action points");
        
        uint256 price = getAssetPrice(players[msg.sender].currentDistrict, assetId);
        uint256 totalValue = price * amount;
        
        // Add a small selling fee
        uint256 fee = totalValue / 20; // 5% fee
        uint256 payment = totalValue - fee;
        
        kingToken.transfer(msg.sender, payment);
        players[msg.sender].inventory[assetId] -= amount;
        players[msg.sender].actionPoints--;
        
        emit AssetTraded(msg.sender, assetId, false, amount, price);
    }
    
    function restoreActionPoints() public {
        require(activePlayers[msg.sender], "Player not active");
        require(block.timestamp >= players[msg.sender].lastActionTime + 3600, "Too soon to restore");
        
        players[msg.sender].actionPoints = 10;
        players[msg.sender].lastActionTime = block.timestamp;
    }
    
    // Helper functions
    function getAssetPrice(District district, uint8 assetId) public view returns (uint256) {
        Asset memory asset = assets[assetId];
        int8 modifier = priceModifiers[district][assetId];
        
        uint256 basePrice = asset.basePrice;
        uint256 volatilityFactor = uint256(asset.volatility) * 10;
        
        // Apply district modifier
        if (modifier > 0) {
            basePrice = basePrice + (basePrice * uint256(modifier) / 10);
        } else if (modifier < 0) {
            basePrice = basePrice - (basePrice * uint256(-modifier) / 10);
        }
        
        // Apply market volatility based on block hash
        uint256 randomFactor = uint256(keccak256(abi.encodePacked(block.number, assetId))) % volatilityFactor;
        if (randomFactor > volatilityFactor / 2) {
            basePrice = basePrice + (basePrice * randomFactor / 100);
        } else {
            basePrice = basePrice - (basePrice * randomFactor / 100);
        }
        
        return basePrice;
    }
    
    function triggerEncounter(address player) private {
        uint8 encounterType = uint8(random(4));
        
        if (encounterType == 0) {
            // Police raid
            District district = players[player].currentDistrict;
            uint8 policePresence = districts[district].policePresence;
            
            // Check for contraband
            bool hasContraband = false;
            for (uint8 i = 0; i < assetCount; i++) {
                if (assets[i].isContraband && players[player].inventory[i] > 0) {
                    hasContraband = true;
                    break;
                }
            }
            
            if (hasContraband && random(10) < policePresence) {
                // Confiscate random contraband
                for (uint8 i = 0; i < assetCount; i++) {
                    if (assets[i].isContraband && players[player].inventory[i] > 0) {
                        uint256 amount = players[player].inventory[i];
                        players[player].inventory[i] = 0;
                        emit EncounterOccurred(player, "Police Raid: Contraband confiscated");
                        break;
                    }
                }
            }
        } else if (encounterType == 1) {
            // Market opportunity
            uint8 randomAsset = uint8(random(assetCount));
            _setPriceModifier(players[player].currentDistrict, randomAsset, -5);
            emit EncounterOccurred(player, "Market Opportunity: Temporary price drop");
        } else if (encounterType == 2) {
            // Rival trader
            // Lose some action points
            if (players[player].actionPoints > 2) {
                players[player].actionPoints -= 2;
                emit EncounterOccurred(player, "Rival Trader: Lost 2 action points");
            }
        } else {
            // Lucky find
            uint8 randomAsset = uint8(random(asset));} else {
            // Lucky find
            uint8 randomAsset = uint8(random(assetCount));
            uint256 randomAmount = random(5) + 1;
            players[player].inventory[randomAsset] += randomAmount;
            emit EncounterOccurred(player, "Lucky Find: Free assets discovered");
        }
    }
    
    function random(uint number) private view returns(uint) {
        return uint(keccak256(abi.encodePacked(block.timestamp, block.difficulty, msg.sender))) % number;
    }
    
    // Admin functions
    function updateDistrict(District district, string memory name, uint8 riskLevel, uint8 policePresence, bool active) public onlyOwner {
        districts[district] = DistrictData(name, riskLevel, policePresence, active);
    }
    
    function updatePriceModifier(District district, uint8 assetId, int8 modifier) public onlyOwner {
        priceModifiers[district][assetId] = modifier;
    }
    
    function withdrawFees(uint256 amount) public onlyOwner {
        kingToken.transfer(owner(), amount);
    }
    
    // View functions
    function getPlayerInventory(address player, uint8 assetId) public view returns (uint256) {
        return players[player].inventory[assetId];
    }
    
    function getPlayerDistrict(address player) public view returns (District) {
        return players[player].currentDistrict;
    }
    
    function getPlayerActionPoints(address player) public view returns (uint8) {
        return players[player].actionPoints;
    }
}
