var Web3 = require('web3');
var web3 = new Web3('ws://localhost:8546');
const abis = require('../test/helpers/AugurContracts/abi.json')
let contract = new web3.eth.Contract(abis.Universe, '0x6a424C1bd008C82191Db24bA1528e60ca92314cA')
contract.methods.getRepMarketCapInAttoCash().call().then(console.log)
