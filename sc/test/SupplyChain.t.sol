// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {SupplyChain} from "../src/SupplyChain.sol";

contract SupplyChainTest is Test {
    SupplyChain public supplyChain;
    address public admin;
    address public user1;

    function setUp() public {
        admin = address(0x1);
        user1 = address(0x2);

        // Hacemos que admin sea quien despliega el contrato
        vm.prank(admin);
        supplyChain = new SupplyChain();
    }

    // 1) Probar que admin está bien configurado
    function testIsAdmin() public view {
        assertTrue(supplyChain.isAdmin(admin));
        assertFalse(supplyChain.isAdmin(user1));
    }

    // 2) Probar que un usuario se puede registrar con rol y queda Pending
    function testUserRegistration() public {
        vm.prank(user1); // simulamos que user1 es msg.sender
        supplyChain.requestUserRole("Producer");

        SupplyChain.User memory userInfo = supplyChain.getUserInfo(user1);

        assertEq(userInfo.userAddress, user1);
        assertEq(userInfo.role, "Producer");
        assertEq(uint(userInfo.status), uint(SupplyChain.UserStatus.Pending));
    }

    // 3) Probar que el admin puede aprobar a un usuario
    function testAdminApproveUser() public {
        // user1 pide rol
        vm.prank(user1);
        supplyChain.requestUserRole("Producer");

        // admin aprueba
        vm.prank(admin);
        supplyChain.changeStatusUser(user1, SupplyChain.UserStatus.Approved);

        SupplyChain.User memory userInfo = supplyChain.getUserInfo(user1);
        assertEq(uint(userInfo.status), uint(SupplyChain.UserStatus.Approved));
    }

    // 4) Probar que un no-admin NO puede cambiar el estado
    function testOnlyAdminCanChangeStatus() public {
        vm.prank(user1);
        supplyChain.requestUserRole("Producer");

        vm.prank(user1); // user1 intenta hacer de admin
        vm.expectRevert(); // esperamos que falle
        supplyChain.changeStatusUser(user1, SupplyChain.UserStatus.Approved);
    }

    // ==== Helpers para tests de tokens ====
    function _registerAndApproveUser(
        address user,
        string memory role
    ) internal {
        // user pide rol
        vm.prank(user);
        supplyChain.requestUserRole(role);

        // admin aprueba
        vm.prank(admin);
        supplyChain.changeStatusUser(user, SupplyChain.UserStatus.Approved);
    }

    // ==== Tests de creación de tokens ====

    function testCreateTokenByProducer() public {
        // 1) Registrar y aprobar a user1 como Producer
        _registerAndApproveUser(user1, "Producer");

        // 2) user1 crea un token de materia prima (parentId = 0)
        vm.prank(user1);
        supplyChain.createToken(
            "Harina de Trigo",
            1000,
            '{"unit":"kg","quality":"A"}',
            0 // sin parent
        );

        // 3) Obtener el token
        SupplyChain.Token memory token = supplyChain.getToken(1);

        assertEq(token.id, 1);
        assertEq(token.creator, user1);
        assertEq(token.name, "Harina de Trigo");
        assertEq(token.totalSupply, 1000);
        assertEq(token.parentId, 0);

        // 4) Verificar balance del creador
        uint256 balance = supplyChain.getTokenBalance(1, user1);
        assertEq(balance, 1000);

        // 5) Verificar que getUserTokens devuelve este token
        uint256[] memory userTokens = supplyChain.getUserTokens(user1);
        assertEq(userTokens.length, 1);
        assertEq(userTokens[0], 1);
    }
    function testTransferFromProducerToFactory() public {
        // Producer y Factory aprobados
        address producer = address(0x10);
        address factory = address(0x11);

        _registerAndApproveUser(producer, "Producer");
        _registerAndApproveUser(factory, "Factory");

        // Producer crea token base
        vm.prank(producer);
        supplyChain.createToken("Harina", 1000, '{"unit":"kg"}', 0);

        // Transferir 200 unidades Producer -> Factory
        vm.prank(producer);
        supplyChain.transfer(factory, 1, 200);

        // Revisar la transferencia
        SupplyChain.Transfer memory t = supplyChain.getTransfer(1);
        assertEq(t.id, 1);
        assertEq(t.from, producer);
        assertEq(t.to, factory);
        assertEq(t.tokenId, 1);
        assertEq(t.amount, 200);
        assertEq(uint(t.status), uint(SupplyChain.TransferStatus.Pending));
    }

    function testAcceptTransfer() public {
        address producer = address(0x12);
        address factory = address(0x13);

        _registerAndApproveUser(producer, "Producer");
        _registerAndApproveUser(factory, "Factory");

        // Producer crea token base
        vm.prank(producer);
        supplyChain.createToken("Harina", 1000, '{"unit":"kg"}', 0);

        // Crear transferencia pendiente
        vm.prank(producer);
        supplyChain.transfer(factory, 1, 300);

        // Factory acepta
        vm.prank(factory);
        supplyChain.acceptTransfer(1);

        // Comprobar balances
        uint256 balanceProducer = supplyChain.getTokenBalance(1, producer);
        uint256 balanceFactory = supplyChain.getTokenBalance(1, factory);

        assertEq(balanceProducer, 700); // 1000 - 300
        assertEq(balanceFactory, 300); // 0 + 300

        // Comprobar estado
        SupplyChain.Transfer memory t = supplyChain.getTransfer(1);
        assertEq(uint(t.status), uint(SupplyChain.TransferStatus.Accepted));
    }

    function testRejectTransfer() public {
        address producer = address(0x14);
        address factory = address(0x15);

        _registerAndApproveUser(producer, "Producer");
        _registerAndApproveUser(factory, "Factory");

        // Producer crea token base
        vm.prank(producer);
        supplyChain.createToken("Harina", 1000, '{"unit":"kg"}', 0);

        // Crear transferencia pendiente
        vm.prank(producer);
        supplyChain.transfer(factory, 1, 400);

        // Factory rechaza
        vm.prank(factory);
        supplyChain.rejectTransfer(1);

        // Comprobar balances (no cambian)
        uint256 balanceProducer = supplyChain.getTokenBalance(1, producer);
        uint256 balanceFactory = supplyChain.getTokenBalance(1, factory);

        assertEq(balanceProducer, 1000);
        assertEq(balanceFactory, 0);

        // Comprobar estado
        SupplyChain.Transfer memory t = supplyChain.getTransfer(1);
        assertEq(uint(t.status), uint(SupplyChain.TransferStatus.Rejected));
    }

    function testUnapprovedUserCannotCreateToken() public {
        address producer = address(0x20);

        // Se registra como Producer pero NO se aprueba
        vm.prank(producer);
        supplyChain.requestUserRole("Producer");

        // Intenta crear token sin estar Approved
        vm.prank(producer);
        vm.expectRevert(); // "User not approved"
        supplyChain.createToken("Harina no aprobada", 500, '{"unit":"kg"}', 0);
    }

    function testUnapprovedUserCannotTransfer() public {
        address producer = address(0x21);
        address factory = address(0x22);

        // Registrar y aprobar Producer y Factory
        _registerAndApproveUser(producer, "Producer");
        _registerAndApproveUser(factory, "Factory");

        // Producer crea token base
        vm.prank(producer);
        supplyChain.createToken("Harina", 1000, '{"unit":"kg"}', 0);

        // Admin cambia estado del producer a Rejected
        vm.prank(admin);
        supplyChain.changeStatusUser(producer, SupplyChain.UserStatus.Rejected);

        // Producer intenta transferir después de ser Rejected
        vm.prank(producer);
        vm.expectRevert(); // "User not approved"
        supplyChain.transfer(factory, 1, 100);
    }

    function testConsumerCannotTransfer() public {
        address producer = address(0x30);
        address factory = address(0x31);
        address retailer = address(0x32);
        address consumer = address(0x33);

        // Registrar y aprobar todos los roles
        _registerAndApproveUser(producer, "Producer");
        _registerAndApproveUser(factory, "Factory");
        _registerAndApproveUser(retailer, "Retailer");
        _registerAndApproveUser(consumer, "Consumer");

        // Producer crea token base
        vm.prank(producer);
        supplyChain.createToken("Harina", 1000, '{"unit":"kg"}', 0);

        // Producer -> Factory (aceptado)
        vm.prank(producer);
        supplyChain.transfer(factory, 1, 400);
        vm.prank(factory);
        supplyChain.acceptTransfer(1);

        // Factory -> Retailer (aceptado)
        vm.prank(factory);
        supplyChain.transfer(retailer, 1, 200);
        vm.prank(retailer);
        supplyChain.acceptTransfer(2);

        // Retailer -> Consumer (aceptado)
        vm.prank(retailer);
        supplyChain.transfer(consumer, 1, 100);
        vm.prank(consumer);
        supplyChain.acceptTransfer(3);

        // Ahora Consumer tiene balance. Intenta transferir y debe fallar
        vm.prank(consumer);
        vm.expectRevert(); // "Consumer cannot transfer"
        supplyChain.transfer(retailer, 1, 50);
    }

    function testTransferZeroAmount() public {
        address producer = address(0x40);
        address factory = address(0x41);

        _registerAndApproveUser(producer, "Producer");
        _registerAndApproveUser(factory, "Factory");

        vm.prank(producer);
        supplyChain.createToken("Harina", 1000, '{"unit":"kg"}', 0);

        // Monto 0 debe revertir
        vm.prank(producer);
        vm.expectRevert(); // "Amount must be > 0"
        supplyChain.transfer(factory, 1, 0);
    }

    function testTransferToSameAddress() public {
        address producer = address(0x42);

        _registerAndApproveUser(producer, "Producer");

        vm.prank(producer);
        supplyChain.createToken("Harina", 1000, '{"unit":"kg"}', 0);

        // Transferir a sí mismo debe revertir
        vm.prank(producer);
        vm.expectRevert(); // "Cannot transfer to self"
        supplyChain.transfer(producer, 1, 100);
    }
}
