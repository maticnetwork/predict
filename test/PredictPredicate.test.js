// const PredictPredicate = artifacts.require('PredictPredicate')
const augurHelper = require('./helpers/AugurHelper.js')
const abis = require('./helpers/AugurContracts/abi.json')

contract('PredictPredicate', async function(accounts) {
  let predictPredicate, from = accounts[0]
  before(async function() {
    // console.log('accounts', accounts)
    // predictPredicate = PredictPredicate.deployed()
  })

  it.only('createYesNoMarket', async function() {
    const universe = augurHelper.getUniverse()
    const createMarket = await universe.methods.createYesNoMarket(1568197952, 0, 0, accounts[0], '').send({ from })
    console.log(createMarket)
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
