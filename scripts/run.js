var Web3 = require('web3');
var web3 = new Web3('ws://localhost:8546');
const abis = require('../test/helpers/AugurContracts/abi.json')
let addresses = require('../test/helpers/AugurContracts/addresses2.json')
const augurHelper = require('../test/helpers/AugurHelper.js')
let accounts = ['0x913dA4198E6bE1D5f5E4a40D0667f70C0B5430Eb', '0xbd355a7e5a7adb23b51f54027e624bfe0e238df6']
let from = accounts[1]
let otherAccount = accounts[0]

const nullAddress = "0x0000000000000000000000000000000000000000"
const DAY = 24 * 60 * 60

async function run() {
  const universe = new web3.eth.Contract(abis.Universe, addresses.Universe)
  const augur = new web3.eth.Contract(abis.Augur, addresses.Augur)
  const repBond = await universe.methods.getOrCacheMarketRepBond().call()
  const repAddress = await universe.methods.getReputationToken().call({ from })
  const repContract = new web3.eth.Contract(abis.TestNetReputationToken, repAddress)
  await repContract.methods.faucet(0).send({ from })
  console.log('getOrCacheMarketRepBond', repBond, 'rep balance', await repContract.methods.balanceOf(from).call())
  const validityBond = await universe.methods.getOrCacheValidityBond().call()
  const cash = (new web3.eth.Contract(abis.Cash, addresses.Cash)).methods
  await cash.faucet(validityBond).send({ from })
  console.log('getOrCacheValidityBond', validityBond, 'cash balance', await cash.balanceOf(from).call())
  const currentTime = parseInt(await augur.methods.getTimestamp().call());
  const endTime = currentTime + (30 * DAY)
  await cash.approve(addresses.Augur, "0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe").send({ from })
  const market = await augurHelper.createReasonableYesNoMarket(universe, endTime, from);
  const marketAddress = market.options.address

  const numTicks = parseInt(await market.methods.getNumTicks().call());

  // Zero X trading happens through the ZeroXTrade contract
  const zeroXTrade = augurHelper.getZeroXTrade()
  // Make an order for 1000 attoShares
  amount = 1000
  // price 60 in a standard market means 60 cents
  const price = 60
  // 1 == YES
  const outcome = 1
  // 0 = BID
  const direction = 0
  // Get the on chain timestamp. We'll use this to calculate the order expiration and as the salt for the order
  const expirationTime = currentTime + 10000
  // Make a call to our contract to properly format the signed order and get the hash for it that we must sign
  console.log("Creating 0x order")
  const { _zeroXOrder, _orderHash } = await zeroXTrade.methods.createZeroXOrder(direction, amount, price, marketAddress, outcome, nullAddress, expirationTime, currentTime).call()
  // Sign the order and prepare the order data / signature for filling
  const signature = await web3.eth.sign(_orderHash, from)

  const orders = [_zeroXOrder]
  const signatures = [signature]

  // No affiliate specified
  const affiliateAddress = nullAddress
  const tradeGroupId = augurHelper.stringTo32ByteHex('42')

  // Calculate the cost of the trade for both parties and faucet them to needed Cash
  const creatorCost = amount * price
  const fillerCost = amount * (numTicks - price);

  console.log(`Fauceting funds`);
  await cash.faucet(creatorCost).send({ from })
  await cash.approve(addresses.Augur, creatorCost).send({ from })

  await cash.faucet(fillerCost).send({ from: otherAccount })
  await cash.approve(addresses.Augur, fillerCost).send({ from: otherAccount })

  // Take the order with a different account
  console.log(`Filling Zero X Order`);
  await zeroXTrade.methods.trade(amount, affiliateAddress, tradeGroupId, orders, signatures).send({ from: otherAccount, gas: 2000000 })
}

run().then((result) => {
  console.log(result);
  process.exit();
}).catch(error => {
  console.log(error);
  process.exit();
});
