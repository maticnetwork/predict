// const PredictPredicate = artifacts.require('PredictPredicate')
const augurHelper = require('./helpers/AugurHelper.js')
const abis = require('./helpers/AugurContracts/abi.json')
// let addresses = require('./helpers//AugurContracts/addresses.json')['103']
let addresses = require('./helpers/AugurContracts/addresses2.json')

const nullAddress = "0x0000000000000000000000000000000000000000"

contract('PredictPredicate', async function(accounts) {
  let predictPredicate, from = accounts[0]
  before(async function() {
    // console.log('accounts', accounts)
    // predictPredicate = PredictPredicate.deployed()
  })

  it.only('createYesNoMarket', async function() {
    const universe = augurHelper.getUniverse()
    const repBond = await universe.methods.getOrCacheMarketRepBond().call()
    console.log('getOrCacheMarketRepBond', repBond)
    const repAddress = await universe.methods.getReputationToken().call({ from: accounts[0] })
    const repContract = new web3.eth.Contract(abis.TestNetReputationToken, repAddress)
    const repTransfer = await repContract.methods.faucet(0).send({ from })
    console.log('rep balance', await repContract.methods.balanceOf(from).call())
    // console.log('rep approve', await repContract.approve(addresses.Universe, repBond).send({ from }))
    // // '0x' + web3.utils.toBN(10).pow(web3.utils.toBN(18)).toString(16)
    const amount = await universe.methods.getOrCacheValidityBond().call()
    const cash = (new web3.eth.Contract(abis.Cash, addresses.Cash)).methods
    await cash.faucet(amount).send({ from })
    console.log('getOrCacheValidityBond', amount, 'cash balance', await cash.balanceOf(from).call())
    console.log(await cash.approve(addresses.Augur, amount).send({ from }))
    const createMarket = await universe.methods.createYesNoMarket(1577788352, 0, 0, accounts[0], '').send({ from })
    console.log(createMarket)
  })

  it('trades', async function() {
    const augur = augurHelper.getAugur()
    const universe = augurHelper.getUniverse()
    const repAddress = await universe.methods.getReputationToken().call({ from: accounts[0] })
    const repTransfer = await (new web3.eth.Contract(abis.TestNetReputationToken, repAddress)).methods.faucet(0).send({ from })
    // '0x' + web3.utils.toBN(10).pow(web3.utils.toBN(18)).toString(16)
    let amount = await universe.methods.getOrCacheValidityBond().call()
    const cash = (new web3.eth.Contract(abis.Cash, addresses.Cash)).methods
    await cash.faucet(amount).send({ from })
    await cash.approve(addresses.Augur, amount).send({ from })
    const createMarket = await universe.methods.createYesNoMarket(1568197952, 0, 0, accounts[0], '').send({ from })
    console.log(createMarket)

    const marketAddress = "TODO" // TODO Get from createMarketResponse

    const market = augurHelper.getMarketFromAddress(marketAddress)
    // Get num ticks to calculate the filler cost later
    const numTicks = await market.methods.getNumTicks().call();

    // Zero X trading happens through the ZeroXTrade contract
    const zeroXTrade = augurHelper.getZeroXTrade()
    // Make an order for 1000 attoShares
    amount = 1000
    // price 60 in a standard market means 60 cents
    const price = 60
    // No affiliate specified
    const affiliateAddress = nullAddress
    const tradeGroupId = augurHelper.stringTo32ByteHex('42')
    // 1 == YES
    const outcome = 1
    // Get the on chain timestamp. We'll use this to calculate the order expiration and as the salt for the order
    const currentTimestamp = await augur.methods.getTimestamp().call();
    const expirationTime = currentTimestamp + 10000
    // Make a call to our contract to properly format the signed order and get the hash for it we must sign
    const { _zeroXOrder, _orderHash } = zeroXTrade.createZeroXOrder(BID, amount, price, marketAddress, outcome, nullAddress, expirationTime, currentTimestamp).call()
    // Sign the order and prepare the order data / signature for filling
    const signature = web3.eth.sign(_orderHash, accounts[0])
    const orders = [_zeroXOrder]
    const signatures = [signature]

    // Calculate the cost of the trade for both parties and faucet them to needed Cash
    const creatorCost = amount * price
    const fillerCost = amount * (numTicks - price);

    await cash.faucet(creatorCost).send({ from })
    await cash.approve(addresses.Augur, creatorCost).send({ from })

    await cash.faucet(fillerCost).send({ from: accounts[1] })
    await cash.approve(fillerCost.Augur, creatorCost).send({ from: accounts[1] })

    // Take the order with a different account
    const amountRemaining = zeroXTrade.trade(amount, affiliateAddress, tradeGroupId, orders, signatures).send({ from: accounts[1] })
  })

  it('other', async function() {
    // const rep = await universe.methods.getReputationToken().call({ from: accounts[0] })
    // const repTransfer = await (new web3.eth.Contract(abis.TestNetReputationToken, rep)).methods.faucet(0).send({ from })
    // console.log(repTransfer)
    // const augur = augurHelper.getAugur()
    // console.log(await augur.getPastEvents('MarketCreated'))
    // await new Promise((resolve, reject) => {
    //   .on('receipt', function(receipt) {
    //     console.log(receipt);
    //     resolve()
    //   })
    // })
    // const createUniverse = await augur.methods.createGenesisUniverse().send({ from })
    // console.log(await web3.eth.getTransaction(createUniverse.transactionHash))
    // console.log('web3.version', web3.version)
    // console.log(await web3.eth.getTransactionReceipt(createMarket.transactionHash))
  })
})
