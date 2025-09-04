// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract ProduceRegistry {
    struct Produce {
        uint256 id;
        address farmer;
        string origin;
        string quality;
        uint256 initialPrice;
        uint256 timestamp;
        bool isActive;
    }

    mapping(uint256 => Produce) public produces;
    uint256 public produceCount;

    event ProduceRegistered(uint256 indexed id, address indexed farmer, string origin);
    event ProduceUpdated(uint256 indexed id, string quality, uint256 price);
    event ProduceDeactivated(uint256 indexed id);

    modifier onlyFarmer(uint256 _id) {
        require(produces[_id].farmer == msg.sender, "Only farmer can modify");
        _;
    }

    function registerProduce(string memory _origin, string memory _quality, uint256 _initialPrice) public {
        produceCount++;
        produces[produceCount] = Produce(produceCount, msg.sender, _origin, _quality, _initialPrice, block.timestamp, true);
        emit ProduceRegistered(produceCount, msg.sender, _origin);
    }

    function updateProduce(uint256 _id, string memory _quality, uint256 _price) public onlyFarmer(_id) {
        require(produces[_id].isActive, "Produce not active");
        produces[_id].quality = _quality;
        produces[_id].initialPrice = _price;
        emit ProduceUpdated(_id, _quality, _price);
    }

    function deactivateProduce(uint256 _id) public onlyFarmer(_id) {
        produces[_id].isActive = false;
        emit ProduceDeactivated(_id);
    }

    function getProduce(uint256 _id) public view returns (Produce memory) {
        return produces[_id];
    }
}