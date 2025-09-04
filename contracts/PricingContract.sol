// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./ProduceRegistry.sol";

contract PricingContract {
    ProduceRegistry public produceRegistry;

    struct PriceUpdate {
        uint256 id;
        uint256 produceId;
        uint256 newPrice;
        address updater;
        string reason;
        uint256 timestamp;
    }

    mapping(uint256 => PriceUpdate) public priceUpdates;
    uint256 public updateCount;

    event PriceUpdated(uint256 indexed id, uint256 indexed produceId, uint256 newPrice, address updater);

    constructor(address _produceRegistryAddress) {
        produceRegistry = ProduceRegistry(_produceRegistryAddress);
    }

    function updatePrice(uint256 _produceId, uint256 _newPrice, string memory _reason) public {
        (, address farmer,,,, bool isActive) = produceRegistry.produces(_produceId);
        require(isActive, "Produce not active");
        // Allow any address to update price for transparency, but in production add role checks

        updateCount++;
        priceUpdates[updateCount] = PriceUpdate(updateCount, _produceId, _newPrice, msg.sender, _reason, block.timestamp);
        emit PriceUpdated(updateCount, _produceId, _newPrice, msg.sender);
    }

    function getPriceUpdate(uint256 _id) public view returns (PriceUpdate memory) {
        return priceUpdates[_id];
    }

    function getPriceHistory(uint256 _produceId) public view returns (uint256[] memory) {
        uint256[] memory result = new uint256[](updateCount);
        uint256 count = 0;
        for (uint256 i = 1; i <= updateCount; i++) {
            if (priceUpdates[i].produceId == _produceId) {
                result[count] = i;
                count++;
            }
        }
        return result;
    }
}