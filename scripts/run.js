var Web3 = require('web3');
var web3 = new Web3('ws://localhost:8546');
const abis = require('../test/helpers/AugurContracts/abi.json')
let addresses = require('../test/helpers/AugurContracts/addresses2.json')
let accounts = ['0x913dA4198E6bE1D5f5E4a40D0667f70C0B5430Eb']
let from = accounts[0]

async function run() {
  const universe = new web3.eth.Contract(abis.Universe, addresses.Universe)
  const repBond = await universe.methods.getOrCacheMarketRepBond().call()
  const repAddress = await universe.methods.getReputationToken().call({ from: accounts[0] })
  const repContract = new web3.eth.Contract(abis.TestNetReputationToken, repAddress)
  const repTransfer = await repContract.methods.faucet(0).send({ from })
  console.log('getOrCacheMarketRepBond', repBond, 'rep balance', await repContract.methods.balanceOf(from).call())
  const amount = await universe.methods.getOrCacheValidityBond().call()
  const cash = (new web3.eth.Contract(abis.Cash, addresses.Cash)).methods
  await cash.faucet(amount).send({ from })
  console.log('getOrCacheValidityBond', amount, 'cash balance', await cash.balanceOf(from).call())
  await cash.approve(addresses.Augur, amount).send({ from })
  const createMarket = await universe.methods.createYesNoMarket(1577788352, 0, 0, accounts[0], '').send({ from })
  return createMarket
}

run().then(console.log)
