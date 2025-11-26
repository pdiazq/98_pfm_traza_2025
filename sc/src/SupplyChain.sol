// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract SupplyChain {
    // ==== Enums ====
    enum UserStatus {
        Pending,
        Approved,
        Rejected,
        Canceled
    }
    enum TransferStatus {
        Pending,
        Accepted,
        Rejected
    }

    // ==== Structs ====
    struct Token {
        uint256 id;
        address creator;
        string name;
        uint256 totalSupply;
        string features; // JSON string
        uint256 parentId;
        uint256 dateCreated;
    }

    struct Transfer {
        uint256 id;
        address from;
        address to;
        uint256 tokenId;
        uint256 dateCreated;
        uint256 amount;
        TransferStatus status;
    }

    struct User {
        uint256 id;
        address userAddress;
        string role; // "Producer", "Factory", "Retailer", "Consumer", "Admin"
        UserStatus status;
    }

    // ==== Estado principal ====
    address public admin;

    uint256 public nextTokenId = 1;
    uint256 public nextTransferId = 1;
    uint256 public nextUserId = 1;

    mapping(uint256 => Token) public tokens;
    mapping(uint256 => Transfer) public transfers;
    mapping(uint256 => User) public users;
    mapping(address => uint256) public addressToUserId;

    // tokenId => (user => balance)
    mapping(uint256 => mapping(address => uint256)) private balances;

    // ==== Eventos ====
    event TokenCreated(
        uint256 indexed tokenId,
        address indexed creator,
        string name,
        uint256 totalSupply
    );
    event TransferRequested(
        uint256 indexed transferId,
        address indexed from,
        address indexed to,
        uint256 tokenId,
        uint256 amount
    );
    event TransferAccepted(uint256 indexed transferId);
    event TransferRejected(uint256 indexed transferId);
    event UserRoleRequested(address indexed user, string role);
    event UserStatusChanged(address indexed user, UserStatus status);

    // ==== Constructor ====
    constructor() {
        admin = msg.sender;

        // Registrar el admin como usuario aprobado
        users[nextUserId] = User({
            id: nextUserId,
            userAddress: msg.sender,
            role: "Admin",
            status: UserStatus.Approved
        });

        addressToUserId[msg.sender] = nextUserId;
        nextUserId++;
    }

    // ==== Modificadores ====
    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin");
        _;
    }

    // ==== Helpers internos ====
    function _getUser(address userAddress) internal view returns (User memory) {
        uint256 userId = addressToUserId[userAddress];
        require(userId != 0, "User not found");
        return users[userId];
    }

    function _requireApprovedUser(
        address userAddress
    ) internal view returns (User memory) {
        User memory user = _getUser(userAddress);
        require(user.status == UserStatus.Approved, "User not approved");
        return user;
    }

    function _hasRole(
        User memory user,
        string memory roleName
    ) internal pure returns (bool) {
        return keccak256(bytes(user.role)) == keccak256(bytes(roleName));
    }

    function _validateTransferRoles(
        User memory fromUser,
        User memory toUser
    ) internal pure {
        if (_hasRole(fromUser, "Producer")) {
            require(
                _hasRole(toUser, "Factory"),
                "Producer can only transfer to Factory"
            );
        } else if (_hasRole(fromUser, "Factory")) {
            require(
                _hasRole(toUser, "Retailer"),
                "Factory can only transfer to Retailer"
            );
        } else if (_hasRole(fromUser, "Retailer")) {
            require(
                _hasRole(toUser, "Consumer"),
                "Retailer can only transfer to Consumer"
            );
        } else if (_hasRole(fromUser, "Consumer")) {
            revert("Consumer cannot transfer");
        } else {
            revert("Invalid from role");
        }
    }

    // ==== Gestión de usuarios ====
    function requestUserRole(string memory role) public {
        require(addressToUserId[msg.sender] == 0, "User already exists");

        uint256 userId = nextUserId;
        users[userId] = User({
            id: userId,
            userAddress: msg.sender,
            role: role,
            status: UserStatus.Pending
        });
        addressToUserId[msg.sender] = userId;
        nextUserId++;

        emit UserRoleRequested(msg.sender, role);
    }

    function changeStatusUser(
        address userAddress,
        UserStatus newStatus
    ) public onlyAdmin {
        uint256 userId = addressToUserId[userAddress];
        require(userId != 0, "User not found");

        users[userId].status = newStatus;
        emit UserStatusChanged(userAddress, newStatus);
    }

    function getUserInfo(
        address userAddress
    ) public view returns (User memory) {
        uint256 userId = addressToUserId[userAddress];
        require(userId != 0, "User not found");
        return users[userId];
    }

    function isAdmin(address userAddress) public view returns (bool) {
        return userAddress == admin;
    }

    // ==== Gestión de Tokens ====

    /// @notice Crea un nuevo token
    /// - Producer: materias primas (parentId = 0)
    /// - Factory/Retailer: productos derivados (parentId != 0)
    function createToken(
        string memory name,
        uint256 totalSupply,
        string memory features,
        uint256 parentId
    ) public {
        // 1️⃣ Sólo usuarios aprobados pueden crear tokens
        User memory user = _requireApprovedUser(msg.sender);

        // 2️⃣ Validar reglas por rol
        if (_hasRole(user, "Producer")) {
            // Producer: sólo materias primas (sin padre)
            require(parentId == 0, "Producer tokens must have no parent");
        } else if (_hasRole(user, "Factory") || _hasRole(user, "Retailer")) {
            // Factory/Retailer: deben derivar de otro token
            require(parentId != 0, "Derived tokens must have a parent");
            require(tokens[parentId].id != 0, "Parent token does not exist");
        } else if (_hasRole(user, "Consumer")) {
            revert("Consumer cannot create tokens");
        } else if (_hasRole(user, "Admin")) {
            // Podrías permitir o no; de momento lo bloqueamos para ser estrictos
            revert("Admin cannot create tokens");
        } else {
            revert("Invalid role");
        }

        require(totalSupply > 0, "Total supply must be > 0");

        uint256 tokenId = nextTokenId;

        tokens[tokenId] = Token({
            id: tokenId,
            creator: msg.sender,
            name: name,
            totalSupply: totalSupply,
            features: features,
            parentId: parentId,
            dateCreated: block.timestamp
        });

        // Asignamos todo el supply al creador
        balances[tokenId][msg.sender] = totalSupply;

        nextTokenId++;

        emit TokenCreated(tokenId, msg.sender, name, totalSupply);
    }

    function getToken(uint256 tokenId) public view returns (Token memory) {
        Token memory token = tokens[tokenId];
        require(token.id != 0, "Token not found");
        return token;
    }

    function getTokenBalance(
        uint256 tokenId,
        address userAddress
    ) public view returns (uint256) {
        return balances[tokenId][userAddress];
    }

    /// @notice Devuelve todos los tokenIds donde el usuario tiene balance > 0
    function getUserTokens(
        address userAddress
    ) public view returns (uint256[] memory) {
        uint256 count = 0;
        // Primero contamos cuántos tokens tiene el usuario
        for (uint256 i = 1; i < nextTokenId; i++) {
            if (balances[i][userAddress] > 0) {
                count++;
            }
        }

        uint256[] memory result = new uint256[](count);
        uint256 index = 0;

        for (uint256 i = 1; i < nextTokenId; i++) {
            if (balances[i][userAddress] > 0) {
                result[index] = i;
                index++;
            }
        }

        return result;
    }

    // ==== Gestión de Transferencias ====

    function transfer(address to, uint256 tokenId, uint256 amount) public {
        require(to != address(0), "Invalid recipient");
        require(to != msg.sender, "Cannot transfer to self");
        require(amount > 0, "Amount must be > 0");

        // Usuarios deben estar aprobados
        User memory fromUser = _requireApprovedUser(msg.sender);
        User memory toUser = _requireApprovedUser(to);

        // Validar que el flujo de roles sea correcto
        _validateTransferRoles(fromUser, toUser);

        // Validar token y balance
        Token memory token = tokens[tokenId];
        require(token.id != 0, "Token not found");
        require(
            balances[tokenId][msg.sender] >= amount,
            "Insufficient balance"
        );

        uint256 transferId = nextTransferId;

        transfers[transferId] = Transfer({
            id: transferId,
            from: msg.sender,
            to: to,
            tokenId: tokenId,
            dateCreated: block.timestamp,
            amount: amount,
            status: TransferStatus.Pending
        });

        nextTransferId++;

        emit TransferRequested(transferId, msg.sender, to, tokenId, amount);
    }

    function acceptTransfer(uint256 transferId) public {
        Transfer storage t = transfers[transferId];
        require(t.id != 0, "Transfer not found");
        require(
            t.status == TransferStatus.Pending,
            "Transfer already processed"
        );
        require(msg.sender == t.to, "Only receiver can accept");

        // Comprobar balance en el momento de aceptar
        require(
            balances[t.tokenId][t.from] >= t.amount,
            "Insufficient balance"
        );

        // Mover saldo
        balances[t.tokenId][t.from] -= t.amount;
        balances[t.tokenId][t.to] += t.amount;

        t.status = TransferStatus.Accepted;

        emit TransferAccepted(transferId);
    }

    function rejectTransfer(uint256 transferId) public {
        Transfer storage t = transfers[transferId];
        require(t.id != 0, "Transfer not found");
        require(
            t.status == TransferStatus.Pending,
            "Transfer already processed"
        );
        require(msg.sender == t.to, "Only receiver can reject");

        t.status = TransferStatus.Rejected;

        emit TransferRejected(transferId);
    }

    function getTransfer(
        uint256 transferId
    ) public view returns (Transfer memory) {
        Transfer memory t = transfers[transferId];
        require(t.id != 0, "Transfer not found");
        return t;
    }

    function getUserTransfers(
        address userAddress
    ) public view returns (uint256[] memory) {
        uint256 count = 0;

        // 1) Contar cuántas transferencias involucran a este usuario
        for (uint256 i = 1; i < nextTransferId; i++) {
            Transfer memory t = transfers[i];
            if (t.from == userAddress || t.to == userAddress) {
                count++;
            }
        }

        // 2) Construir el array con los IDs
        uint256[] memory result = new uint256[](count);
        uint256 index = 0;

        for (uint256 i = 1; i < nextTransferId; i++) {
            Transfer memory t = transfers[i];
            if (t.from == userAddress || t.to == userAddress) {
                result[index] = i;
                index++;
            }
        }

        return result;
    }
}
