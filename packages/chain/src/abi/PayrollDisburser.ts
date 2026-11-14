// Generated from contracts/out/PayrollDisburser.sol/PayrollDisburser.json by scripts/gen-abis.mjs. Do not edit.
export const PayrollDisburserAbi = [
  {
    "type": "function",
    "name": "PAY_RUN_APPROVAL_TYPEHASH",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "disburse",
    "inputs": [
      {
        "name": "runId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "legs",
        "type": "tuple[]",
        "internalType": "struct PayrollDisburser.Leg[]",
        "components": [
          {
            "name": "payoutId",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "token",
            "type": "address",
            "internalType": "address"
          },
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
        ]
      },
      {
        "name": "allowPartial",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "outputs": [
      {
        "name": "okCount",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "legKey",
    "inputs": [
      {
        "name": "runId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "payoutId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "pure"
  },
  {
    "type": "function",
    "name": "paid",
    "inputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "payRunApprovalTypehash",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "pure"
  },
  {
    "type": "event",
    "name": "LegFailed",
    "inputs": [
      {
        "name": "runId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "payoutId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "token",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      },
      {
        "name": "to",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "reason",
        "type": "bytes",
        "indexed": false,
        "internalType": "bytes"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "LegPaid",
    "inputs": [
      {
        "name": "runId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "payoutId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "token",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      },
      {
        "name": "to",
        "type": "address",
        "indexed": false,
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
    "name": "LegSkipped",
    "inputs": [
      {
        "name": "runId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "payoutId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "token",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      },
      {
        "name": "to",
        "type": "address",
        "indexed": false,
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
    "name": "RunDisbursed",
    "inputs": [
      {
        "name": "runId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "payer",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "legCount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "okCount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "BadLeg",
    "inputs": [
      {
        "name": "index",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "EmptyBatch",
    "inputs": []
  },
  {
    "type": "error",
    "name": "LegTransferFailed",
    "inputs": [
      {
        "name": "index",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "reason",
        "type": "bytes",
        "internalType": "bytes"
      }
    ]
  },
  {
    "type": "error",
    "name": "ReentrancyGuardReentrantCall",
    "inputs": []
  }
] as const;
export const PayrollDisburserBytecode = "0x6080604052348015600e575f80fd5b5060015f556109ce806100205f395ff3fe608060405234801561000f575f80fd5b5060043610610064575f3560e01c80639f987ed61161004d5780639f987ed6146100dc578063add89bb2146100ef578063c559dc1c14610121575f80fd5b80632381a55b14610068578063874a007e146100a2575b5f80fd5b61008f7fc138ec426e3f75daa6f9bd6410c32a691b52387f7b59944cc2773c20afeb965f81565b6040519081526020015b60405180910390f35b61008f6100b0366004610730565b604080516020808201949094528082019290925280518083038201815260609092019052805191012090565b61008f6100ea366004610760565b610147565b6101116100fd3660046107ed565b60016020525f908152604090205460ff1681565b6040519015158152602001610099565b7fc138ec426e3f75daa6f9bd6410c32a691b52387f7b59944cc2773c20afeb965f61008f565b5f610150610518565b825f81900361018b576040517fc2e5347d00000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b5f5b818110156104c857368686838181106101a8576101a8610804565b6080029190910191505f90506101c46060830160408401610831565b73ffffffffffffffffffffffffffffffffffffffff16148061020a57505f6101f26040830160208401610831565b73ffffffffffffffffffffffffffffffffffffffff16145b8061021757506060810135155b15610256576040517f335a98e2000000000000000000000000000000000000000000000000000000008152600481018390526024015b60405180910390fd5b6040805160208082018b9052833582840152825180830384018152606090920183528151918101919091205f81815260019092529190205460ff161561031e578135897fad09c266934ef6ef6ade06d371b013a318f4f0b0c46979e4d3c88b1d0b66e8876102ca6040860160208701610831565b6102da6060870160408801610831565b6040805173ffffffffffffffffffffffffffffffffffffffff9384168152929091166020830152606080880135918301919091520160405180910390a350506104c0565b5f8061034e6103336040860160208701610831565b336103446060880160408901610831565b8760600135610559565b915091508115610425575f83815260016020819052604090912080547fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff001690911790558661039b8161086b565b97505083358b7f6ebb79d2137c528442a6aad95d6ce25b3c86a219925c839da67d0b867a4f26d66103d26040880160208901610831565b6103e26060890160408a01610831565b6040805173ffffffffffffffffffffffffffffffffffffffff93841681529290911660208301526060808a013591830191909152015b60405180910390a36104bb565b87156104855783358b7f491922876bd311738afaa23ce7f4f74bcb461e9f6f462256d0108ce5843990b461045f6040880160208901610831565b61046f6060890160408a01610831565b88606001358660405161041894939291906108f5565b84816040517f2f1d656900000000000000000000000000000000000000000000000000000000815260040161024d92919061094f565b505050505b60010161018d565b506040805182815260208101849052339188917ffa8826550fef9e3de6efb2d36a1c26c064369564be3ebd6fd16728de90d5dfcf910160405180910390a35061051060015f55565b949350505050565b60025f5403610553576040517f3ee5aeb500000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b60025f55565b5f60608573ffffffffffffffffffffffffffffffffffffffff163b5f036105b757505060408051808201909152600e81527f6e6f74206120636f6e747261637400000000000000000000000000000000000060208201525f90610727565b60405173ffffffffffffffffffffffffffffffffffffffff86811660248301528581166044830152606482018590525f91829189169060840160408051601f198184030181529181526020820180517bffffffffffffffffffffffffffffffffffffffffffffffffffffffff167f23b872dd00000000000000000000000000000000000000000000000000000000179052516106539190610967565b5f604051808303815f865af19150503d805f811461068c576040519150601f19603f3d011682016040523d82523d5f602084013e610691565b606091505b5091509150816106a7575f935091506107279050565b8051158015906106c85750808060200190518101906106c6919061097d565b155b1561070f575f6040518060400160405280601b81526020017f7472616e7366657246726f6d2072657475726e65642066616c73650000000000815250935093505050610727565b600160405180602001604052805f8152509350935050505b94509492505050565b5f8060408385031215610741575f80fd5b50508035926020909101359150565b801515811461075d575f80fd5b50565b5f805f8060608587031215610773575f80fd5b84359350602085013567ffffffffffffffff811115610790575f80fd5b8501601f810187136107a0575f80fd5b803567ffffffffffffffff8111156107b6575f80fd5b8760208260071b84010111156107ca575f80fd5b6020919091019350915060408501356107e281610750565b939692955090935050565b5f602082840312156107fd575f80fd5b5035919050565b7f4e487b71000000000000000000000000000000000000000000000000000000005f52603260045260245ffd5b5f60208284031215610841575f80fd5b813573ffffffffffffffffffffffffffffffffffffffff81168114610864575f80fd5b9392505050565b5f7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff82036108c0577f4e487b71000000000000000000000000000000000000000000000000000000005f52601160045260245ffd5b5060010190565b5f81518084528060208401602086015e5f602082860101526020601f19601f83011685010191505092915050565b73ffffffffffffffffffffffffffffffffffffffff8516815273ffffffffffffffffffffffffffffffffffffffff84166020820152826040820152608060608201525f61094560808301846108c7565b9695505050505050565b828152604060208201525f61051060408301846108c7565b5f82518060208501845e5f920191825250919050565b5f6020828403121561098d575f80fd5b81516108648161075056fea264697066735822122018a338c82a3f41f908042213696e2e410af4985cd0531427b46653c782355c8864736f6c634300081a0033" as const;
