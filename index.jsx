// React Component for the game's main interface

import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import Web3Modal from 'web3modal';
import { KingpinABI, TokenABI, PlayerNFTABI } from './abis';

// Contract addresses would be injected from environment variables in production
const GAME_ADDRESS = "0x1234...";
const TOKEN_ADDRESS = "0x2345...";
const NFT_ADDRESS = "0x3456...";

const CryptoKingpin = () => {
  // Game state
  const [account, setAccount] = useState(null);
  const [gameContract, setGameContract] = useState(null);
  const [tokenContract, setTokenContract] = useState(null);
  const [nftContract, setNftContract] = useState(null);
  const [playerState, setPlayerState] = useState({
    currentDistrict: 0,
    actionPoints: 0,
    inventory: {}
  });
  const [assets, setAssets] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [isRegistered, setIsRegistered] = useState(false);
  const [gameMessage, setGameMessage] = useState("");

  // Map visualization state
  const [mapSize, setMapSize] = useState(10);
  const [playerPosition, setPlayerPosition] = useState({ x: 0, y: 0 });

  // Connect wallet
  const connectWallet = async () => {
    try {
      const web3Modal = new Web3Modal();
      const connection = await web3Modal.connect();
      const provider = new ethers.providers.Web3Provider(connection);
      const signer = provider.getSigner();
      const address = await signer.getAddress();
      
      // Initialize contracts
      const game = new ethers.Contract(GAME_ADDRESS, KingpinABI, signer);
      const token = new ethers.Contract(TOKEN_ADDRESS, TokenABI, signer);
      const nft = new ethers.Contract(NFT_ADDRESS, PlayerNFTABI, signer);
      
      setAccount(address);
      setGameContract(game);
      setTokenContract(token);
      setNftContract(nft);
      
      // Check if player is registered
      const active = await game.activePlayers(address);
      setIsRegistered(active);
      
      if (active) {
        await loadPlayerState(game, address);
      }
      
      // Load game data
      await loadGameData(game);
    } catch (error) {
      console.error("Connection failed:", error);
    }
  };

  // Load player state
  const loadPlayerState = async (game, address) => {
    try {
      const playerData = await game.players(address);
      const district = playerData.currentDistrict;
      const actionPoints = playerData.actionPoints;
      
      // Get inventory for each asset
      const assetCount = await game.assetCount();
      const inventory = {};
      
      for (let i = 0; i < assetCount; i++) {
        const amount = await game.getPlayerInventory(address, i);
        inventory[i] = amount.toNumber();
      }
      
      setPlayerState({
        currentDistrict: district,
        actionPoints: actionPoints,
        inventory: inventory
      });
      
      // Update player position on map based on district
      updatePlayerPosition(district);
    } catch (error) {
      console.error("Failed to load player state:", error);
    }
  };

  // Load game data (assets, districts)
  const loadGameData = async (game) => {
    try {
      const assetCount = await game.assetCount();
      const assetList = [];
      
      for (let i = 0; i < assetCount; i++) {
        const asset = await game.assets(i);
        assetList.push({
          id: i,
          name: asset.name,
          basePrice: asset.basePrice.toNumber(),
          volatility: asset.volatility,
          isContraband: asset.isContraband
        });
      }
      
      setAssets(assetList);
      
      // Load districts
      const districtList = [];
      const districtTypes = [
        "FINANCIAL", "TECH_HUB", "BLACK_MARKET", "RESIDENTIAL", 
        "INDUSTRIAL", "DOCKS", "DOWNTOWN", "OUTSKIRTS"
      ];
      
      for (let i = 0; i < districtTypes.length; i++) {
        const district = await game.districts(i);
        districtList.push({
          id: i,
          name: district.name,
          riskLevel: district.riskLevel,
          policePresence: district.policePresence,
          active: district.active
        });
      }
      
      setDistricts(districtList);
    } catch (error) {
      console.error("Failed to load game data:", error);
    }
  };

  // Register player
  const registerPlayer = async () => {
    try {
      // Check if player has an NFT
      const balance = await nftContract.balanceOf(account);
      
      if (balance.toNumber() === 0) {
        setGameMessage("You need to mint a player NFT first");
        return;
      }
      
      const tokenId = await nftContract.tokenOfOwnerByIndex(account, 0);
      const tx = await gameContract.registerPlayer(tokenId);
      await tx.wait();
      
      setIsRegistered(true);
      setGameMessage("Successfully registered as a player!");
      await loadPlayerState(gameContract, account);
    } catch (error) {
      console.error("Registration failed:", error);
      setGameMessage("Registration failed: " + error.message);
    }
  };

  // Move to district
  const moveToDistrict = async (districtId) => {
    try {
      if (playerState.actionPoints < 1) {
        setGameMessage("Not enough action points!");
        return;
      }
      
      const tx = await gameContract.moveToDistrict(districtId);
      await tx.wait();
      
      setGameMessage(`Moved to ${districts[districtId].name}`);
      await loadPlayerState(gameContract, account);
      
      // Listen for encounter events
      gameContract.on("EncounterOccurred", (player, encounterType) => {
        if (player === account) {
          setGameMessage(`Encounter: ${encounterType}`);
        }
      });
    } catch (error) {
      console.error("Move failed:", error);
      setGameMessage("Move failed: " + error.message);
    }
  };

  // Buy asset
  const buyAsset = async (assetId, amount) => {
    try {
      if (playerState.actionPoints < 1) {
        setGameMessage("Not enough action points!");
        return;
      }
      
      // Get current price
      const price = await gameContract.getAssetPrice(playerState.currentDistrict, assetId);
      const totalCost = price.mul(amount);
      
      // Approve token spending
      const approveTx = await tokenContract.approve(GAME_ADDRESS, totalCost);
      await approveTx.wait();
      
      // Buy asset
      const buyTx = await gameContract.buyAsset(assetId, amount);
      await buyTx.wait();
      
      setGameMessage(`Bought ${amount} ${assets[assetId].name}`);
      await loadPlayerState(gameContract, account);
    } catch (error) {
      console.error("Purchase failed:", error);
      setGameMessage("Purchase failed: " + error.message);
    }
  };

  // Sell asset
  const sellAsset = async (assetId, amount) => {
    try {
      if (playerState.actionPoints < 1) {
        setGameMessage("Not enough action points!");
        return;
      }
      
      if (playerState.inventory[assetId] < amount) {
        setGameMessage("Not enough assets in inventory!");
        return;
      }
      
      const tx = await gameContract.sellAsset(assetId, amount);
      await tx.wait();
      
      setGameMessage(`Sold ${amount} ${assets[assetId].name}`);
      await loadPlayerState(gameContract, account);
    } catch (error) {
      console.error("Sale failed:", error);
      setGameMessage("Sale failed: " + error.message);
    }
  };

  // Restore action points
  const restoreActionPoints = async () => {
    try {
      const tx = await gameContract.restoreActionPoints();
      await tx.wait();
      
      setGameMessage("Action points restored!");
      await loadPlayerState(gameContract, account);
    } catch (error) {
      console.error("Restore failed:", error);
      setGameMessage("Restore failed: " + error.message);
    }
  };

  // Update player position on map
  const updatePlayerPosition = (districtId) => {
    // Map district IDs to 2D coordinates
    const districtPositions = [
      { x: 2, y: 2 }, // FINANCIAL
      { x: 5, y: 2 }, // TECH_HUB
      { x: 8, y: 8 }, // BLACK_MARKET
      { x: 3, y: 5 }, // RESIDENTIAL
      { x: 6, y: 7 }, // INDUSTRIAL
      { x: 8, y: 1 }, // DOCKS
      { x: 5, y: 5 }, // DOWNTOWN
      { x: 1, y: 8 }  // OUTSKIRTS
    ];
    
    setPlayerPosition(districtPositions[districtId]);
  };

  // Render game map
  const renderMap = () => {
    const map = [];
    
    for (let y = 0; y < mapSize; y++) {
      const row = [];
      for (let x = 0; x < mapSize; x++) {
        // Find if there's a district at this position
        const districtPositions = [
          { x: 2, y: 2, id: 0 }, // FINANCIAL
          { x: 5, y: 2, id: 1 }, // TECH_HUB
          { x: 8, y: 8, id: 2 }, // BLACK_MARKET
          { x: 3, y: 5, id: 3 }, // RESIDENTIAL
          { x: 6, y: 7, id: 4 }, // INDUSTRIAL
          { x: 8, y: 1, id: 5 }, // DOCKS
          { x: 5, y: 5, id: 6 }, // DOWNTOWN
          { x: 1, y: 8, id: 7 }  // OUTSKIRTS
        ];
        
        const district = districtPositions.find(d => d.x === x && d.y === y);
        const isPlayer = playerPosition.x === x && playerPosition.y === y;
        
        row.push(
          <div 
            key={`${x}-${y}`}
            className={`
              w-12 h-12 border border-gray-300
              ${district ? 'bg-blue-200' : 'bg-gray-100'}
              ${isPlayer ? 'bg-red-500' : ''}
              flex items-center justify-center
              relative
            `}
            onClick={() => district && moveToDistrict(district.id)}
          >
            {district && <div className="text-xs">{districts[district.id]?.name.substring(0, 3)}</div>}
            {isPlayer && <div className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full"></div>}
          </div>
        );
      }
      map.push(<div key={y} className="flex">{row}</div>);
    }
    
    return <div>{map}</div>;
  };

  // Render market interface
  const renderMarket = () => {
    if (!isRegistered || !assets.length) return null;
    
    return (
      <div className="mt-4 p-4 border rounded">
        <h2 className="text-xl mb-2">Market in {districts[playerState.currentDistrict]?.name}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {assets.map(asset => (
            <div key={asset.id} className="border p-2 rounded">
              <div className="flex justify-between">
                <div className="font-bold">{asset.name}</div>
                <div className={asset.isContraband ? "text-red-500" : "text-green-500"}>
                  {asset.isContraband ? "⚠️ Contraband" : "✓ Legal"}
                </div>
              </div>
              <div>Inventory: {playerState.inventory[asset.id] || 0}</div>
              
              <div className="flex justify-between mt-2">
                <button 
                  className="bg-green-500 text-white px-2 py-1 rounded" 
                  onClick={() => buyAsset(asset.id, 1)}
                >
                  Buy
                </button>
                <button 
                  className="bg-red-500 text-white px-2 py-1 rounded"
                  onClick={() => sellAsset(asset.id, 1)}
                  disabled={!playerState.inventory[asset.id]}
                >
                  Sell
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-6">Crypto Kingpin</h1>
      
      {!account ? (
        <button 
          className="bg-blue-500 text-white px-4 py-2 rounded"
          onClick={connectWallet}>
          Connect Wallet
        </button>
      ) : (
        <div>
          <div className="mb-4">
            <div className="flex justify-between items-center">
              <div>
                <span className="font-bold">Address:</span> {account.substring(0, 6)}...{account.substring(38)}
              </div>
              <div>
                <span className="font-bold">Action Points:</span> {playerState.actionPoints}
                <button 
                  className="ml-2 bg-blue-500 text-white px-2 py-1 rounded text-sm"
                  onClick={restoreActionPoints}
                >
                  Restore
                </button>
              </div>
            </div>
          </div>
          
          {gameMessage && (
            <div className="my-4 p-3 bg-yellow-100 border border-yellow-300 rounded">
              {gameMessage}
            </div>
          )}
          
          {!isRegistered ? (
            <div className="p-4 border rounded mb-4">
              <h2 className="text-xl mb-2">Welcome to Crypto Kingpin</h2>
              <p className="mb-4">You need to register with a player NFT to start playing.</p>
              <button 
                className="bg-purple-500 text-white px-4 py-2 rounded"
                onClick={registerPlayer}
              >
                Register Player
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h2 className="text-xl mb-4">City Map</h2>
                <div className="border p-2 rounded bg-gray-50">
                  {renderMap()}
                </div>
                <div className="mt-2 text-sm">
                  Click on a district to move there (costs 1 action point)
                </div>
              </div>
              
              <div>
                <h2 className="text-xl mb-4">Player Status</h2>
                <div className="border p-4 rounded">
                  <div><span className="font-bold">Current Location:</span> {districts[playerState.currentDistrict]?.name}</div>
                  <div><span className="font-bold">Risk Level:</span> {districts[playerState.currentDistrict]?.riskLevel}/10</div>
                  <div><span className="font-bold">Police Presence:</span> {districts[playerState.currentDistrict]?.policePresence}/10</div>
                  
                  <div className="mt-4">
                    <h3 className="font-bold">Inventory</h3>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      {assets.map(asset => 
                        playerState.inventory[asset.id] > 0 && (
                          <div key={asset.id} className="border p-2 rounded text-sm">
                            <div className="font-bold">{asset.name}</div>
                            <div>{playerState.inventory[asset.id]} units</div>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {renderMarket()}
          
          <div className="mt-8 text-sm text-gray-500">
            <h3 className="font-bold mb-2">Game Help</h3>
            <ul className="list-disc pl-5">
              <li>Move between districts to find the best prices</li>
              <li>Buy low, sell high to make profits</li>
              <li>Watch out for police in districts with high police presence if you're carrying contraband</li>
              <li>Action points replenish every hour</li>
              <li>You need KingTokens (KING) to trade in the game</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

export default CryptoKingpin;





          
