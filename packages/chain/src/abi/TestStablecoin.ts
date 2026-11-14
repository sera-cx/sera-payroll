// Generated from contracts/out/TestStablecoin.sol/TestStablecoin.json by scripts/gen-abis.mjs. Do not edit.
export const TestStablecoinAbi = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "name_",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "symbol_",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "decimals_",
        "type": "uint8",
        "internalType": "uint8"
      },
      {
        "name": "faucetAmount_",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "faucetCooldown_",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "allowance",
    "inputs": [
      {
        "name": "owner",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "spender",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "approve",
    "inputs": [
      {
        "name": "spender",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "value",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "balanceOf",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "decimals",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint8",
        "internalType": "uint8"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "faucet",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "faucetAmount",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "faucetCooldown",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "lastFaucetAt",
    "inputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "mint",
    "inputs": [
      {
        "name": "to",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "name",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "string",
        "internalType": "string"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "owner",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "renounceOwnership",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "symbol",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "string",
        "internalType": "string"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "totalSupply",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "transfer",
    "inputs": [
      {
        "name": "to",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "value",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "transferFrom",
    "inputs": [
      {
        "name": "from",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "to",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "value",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "transferOwnership",
    "inputs": [
      {
        "name": "newOwner",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "event",
    "name": "Approval",
    "inputs": [
      {
        "name": "owner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "spender",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "value",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Faucet",
    "inputs": [
      {
        "name": "to",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "OwnershipTransferred",
    "inputs": [
      {
        "name": "previousOwner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "newOwner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Transfer",
    "inputs": [
      {
        "name": "from",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "to",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "value",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "ERC20InsufficientAllowance",
    "inputs": [
      {
        "name": "spender",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "allowance",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "needed",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "ERC20InsufficientBalance",
    "inputs": [
      {
        "name": "sender",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "balance",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "needed",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "ERC20InvalidApprover",
    "inputs": [
      {
        "name": "approver",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "ERC20InvalidReceiver",
    "inputs": [
      {
        "name": "receiver",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "ERC20InvalidSender",
    "inputs": [
      {
        "name": "sender",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "ERC20InvalidSpender",
    "inputs": [
      {
        "name": "spender",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "FaucetCooldown",
    "inputs": [
      {
        "name": "availableAt",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "OwnableInvalidOwner",
    "inputs": [
      {
        "name": "owner",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "OwnableUnauthorizedAccount",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ]
  }
] as const;
export const TestStablecoinBytecode = "0x60e060405234801561000f575f80fd5b50604051610f82380380610f8283398101604081905261002e91610188565b338585600361003d8382610299565b50600461004a8282610299565b5050506001600160a01b03811661007a57604051631e4fbdf760e01b81525f600482015260240160405180910390fd5b6100838161009a565b5060ff90921660805260a05260c052506103539050565b600580546001600160a01b038381166001600160a01b0319831681179093556040519116919082907f8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e0905f90a35050565b634e487b7160e01b5f52604160045260245ffd5b5f82601f83011261010e575f80fd5b81516001600160401b03811115610127576101276100eb565b604051601f8201601f19908116603f011681016001600160401b0381118282101715610155576101556100eb565b60405281815283820160200185101561016c575f80fd5b8160208501602083015e5f918101602001919091529392505050565b5f805f805f60a0868803121561019c575f80fd5b85516001600160401b038111156101b1575f80fd5b6101bd888289016100ff565b602088015190965090506001600160401b038111156101da575f80fd5b6101e6888289016100ff565b945050604086015160ff811681146101fc575f80fd5b6060870151608090970151959894975095949392505050565b600181811c9082168061022957607f821691505b60208210810361024757634e487b7160e01b5f52602260045260245ffd5b50919050565b601f82111561029457805f5260205f20601f840160051c810160208510156102725750805b601f840160051c820191505b81811015610291575f815560010161027e565b50505b505050565b81516001600160401b038111156102b2576102b26100eb565b6102c6816102c08454610215565b8461024d565b6020601f8211600181146102f8575f83156102e15750848201515b5f19600385901b1c1916600184901b178455610291565b5f84815260208120601f198516915b828110156103275787850151825560209485019460019092019101610307565b508482101561034457868401515f19600387901b60f8161c191681555b50505050600190811b01905550565b60805160a05160c051610bf06103925f395f8181610219015261041101525f8181610263015281816104ab01526104d401525f6101a50152610bf05ff3fe608060405234801561000f575f80fd5b5060043610610115575f3560e01c8063715018a6116100ad5780639c2814301161007d578063dd62ed3e11610063578063dd62ed3e14610298578063de5f72fd146102d0578063f2fde38b146102d8575f80fd5b80639c2814301461025e578063a9059cbb14610285575f80fd5b8063715018a61461020c5780637e36320b146102145780638da5cb5b1461023b57806395d89b4114610256575f80fd5b80632681616e116100e85780632681616e1461017f578063313ce5671461019e57806340c10f19146101cf57806370a08231146101e4575f80fd5b806306fdde0314610119578063095ea7b31461013757806318160ddd1461015a57806323b872dd1461016c575b5f80fd5b6101216102eb565b60405161012e9190610a10565b60405180910390f35b61014a610145366004610a7e565b61037b565b604051901515815260200161012e565b6002545b60405190815260200161012e565b61014a61017a366004610aa6565b610394565b61015e61018d366004610ae0565b60066020525f908152604090205481565b60405160ff7f000000000000000000000000000000000000000000000000000000000000000016815260200161012e565b6101e26101dd366004610a7e565b6103b7565b005b61015e6101f2366004610ae0565b6001600160a01b03165f9081526020819052604090205490565b6101e26103cd565b61015e7f000000000000000000000000000000000000000000000000000000000000000081565b6005546040516001600160a01b03909116815260200161012e565b6101216103e0565b61015e7f000000000000000000000000000000000000000000000000000000000000000081565b61014a610293366004610a7e565b6103ef565b61015e6102a6366004610b00565b6001600160a01b039182165f90815260016020908152604080832093909416825291909152205490565b6101e26103fc565b6101e26102e6366004610ae0565b610527565b6060600380546102fa90610b31565b80601f016020809104026020016040519081016040528092919081815260200182805461032690610b31565b80156103715780601f1061034857610100808354040283529160200191610371565b820191905f5260205f20905b81548152906001019060200180831161035457829003601f168201915b5050505050905090565b5f3361038881858561057d565b60019150505b92915050565b5f336103a185828561058f565b6103ac858585610642565b506001949350505050565b6103bf6106d1565b6103c98282610717565b5050565b6103d56106d1565b6103de5f610764565b565b6060600480546102fa90610b31565b5f33610388818585610642565b335f90815260066020526040812054610436907f000000000000000000000000000000000000000000000000000000000000000090610b82565b335f908152600660205260409020549091501580159061045557508042105b15610494576040517f12272bab000000000000000000000000000000000000000000000000000000008152600481018290526024015b60405180910390fd5b335f8181526006602052604090204290556104cf907f0000000000000000000000000000000000000000000000000000000000000000610717565b6040517f0000000000000000000000000000000000000000000000000000000000000000815233907f1c5347d1e37925b93058518c26d7daabe45f0a3227e8d058aaf3682960eb2b949060200160405180910390a250565b61052f6106d1565b6001600160a01b038116610571576040517f1e4fbdf70000000000000000000000000000000000000000000000000000000081525f600482015260240161048b565b61057a81610764565b50565b61058a83838360016107cd565b505050565b6001600160a01b038381165f908152600160209081526040808320938616835292905220547fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff811461063c578181101561062e576040517ffb8f41b20000000000000000000000000000000000000000000000000000000081526001600160a01b0384166004820152602481018290526044810183905260640161048b565b61063c84848484035f6107cd565b50505050565b6001600160a01b038316610684576040517f96c6fd1e0000000000000000000000000000000000000000000000000000000081525f600482015260240161048b565b6001600160a01b0382166106c6576040517fec442f050000000000000000000000000000000000000000000000000000000081525f600482015260240161048b565b61058a8383836108d1565b6005546001600160a01b031633146103de576040517f118cdaa700000000000000000000000000000000000000000000000000000000815233600482015260240161048b565b6001600160a01b038216610759576040517fec442f050000000000000000000000000000000000000000000000000000000081525f600482015260240161048b565b6103c95f83836108d1565b600580546001600160a01b038381167fffffffffffffffffffffffff0000000000000000000000000000000000000000831681179093556040519116919082907f8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e0905f90a35050565b6001600160a01b03841661080f576040517fe602df050000000000000000000000000000000000000000000000000000000081525f600482015260240161048b565b6001600160a01b038316610851576040517f94280d620000000000000000000000000000000000000000000000000000000081525f600482015260240161048b565b6001600160a01b038085165f908152600160209081526040808320938716835292905220829055801561063c57826001600160a01b0316846001600160a01b03167f8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925846040516108c391815260200190565b60405180910390a350505050565b6001600160a01b0383166108fb578060025f8282546108f09190610b82565b909155506109849050565b6001600160a01b0383165f9081526020819052604090205481811015610966576040517fe450d38c0000000000000000000000000000000000000000000000000000000081526001600160a01b0385166004820152602481018290526044810183905260640161048b565b6001600160a01b0384165f9081526020819052604090209082900390555b6001600160a01b0382166109a0576002805482900390556109be565b6001600160a01b0382165f9081526020819052604090208054820190555b816001600160a01b0316836001600160a01b03167fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef83604051610a0391815260200190565b60405180910390a3505050565b602081525f82518060208401528060208501604085015e5f6040828501015260407fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe0601f83011684010191505092915050565b80356001600160a01b0381168114610a79575f80fd5b919050565b5f8060408385031215610a8f575f80fd5b610a9883610a63565b946020939093013593505050565b5f805f60608486031215610ab8575f80fd5b610ac184610a63565b9250610acf60208501610a63565b929592945050506040919091013590565b5f60208284031215610af0575f80fd5b610af982610a63565b9392505050565b5f8060408385031215610b11575f80fd5b610b1a83610a63565b9150610b2860208401610a63565b90509250929050565b600181811c90821680610b4557607f821691505b602082108103610b7c577f4e487b71000000000000000000000000000000000000000000000000000000005f52602260045260245ffd5b50919050565b8082018082111561038e577f4e487b71000000000000000000000000000000000000000000000000000000005f52601160045260245ffdfea2646970667358221220f38443dc0f70b5204ed6f750a40f08c866a3708f2efaa19495498694288ebd5f64736f6c634300081a0033" as const;
