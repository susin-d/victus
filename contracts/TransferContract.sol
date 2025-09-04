// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./ProduceRegistry.sol";

contract TransferContract {
    ProduceRegistry public produceRegistry;

    struct Transfer {
        uint256 id;
        uint256 produceId;
        address from;
        address to;
        string logisticsInfo;
        uint256 timestamp;
    }

    mapping(uint256 => Transfer) public transfers;
    uint256 public transferCount;

    event TransferLogged(uint256 indexed id, uint256 indexed produceId, address from, address to);

    constructor(address _produceRegistryAddress) {
        produceRegistry = ProduceRegistry(_produceRegistryAddress);
    }

    function logTransfer(uint256 _produceId, address _to, string memory _logisticsInfo) public {
        (, address farmer,,,, bool isActive) = produceRegistry.produces(_produceId);
        require(isActive, "Produce not active");
        require(msg.sender == farmer || transfers[transferCount].to == msg.sender, "Unauthorized transfer");

        transferCount++;
        transfers[transferCount] = Transfer(transferCount, _produceId, msg.sender, _to, _logisticsInfo, block.timestamp);
        emit TransferLogged(transferCount, _produceId, msg.sender, _to);
    }

    function getTransfer(uint256 _id) public view returns (Transfer memory) {
        return transfers[_id];
    }

    function getTransfersForProduce(uint256 _produceId) public view returns (uint256[] memory) {
        uint256[] memory result = new uint256[](transferCount);
        uint256 count = 0;
        for (uint256 i = 1; i <= transferCount; i++) {
            if (transfers[i].produceId == _produceId) {
                result[count] = i;
                count++;
            }
        }
        // Note: This is inefficient for large datasets; in production, use events or off-chain indexing
        return result;
    }
}