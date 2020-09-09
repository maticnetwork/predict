// import { readFile } from 'async-file'
// import { increaseBlockTime } from './time'
// import { web3, artifacts, abis, from, gas, otherAccount, incrementTimestamp } from '../helpers/utils'

// export async function processExits(tokenAddress, web3client = web3) {
//   await increaseBlockTime(web3client, 14 * 86400)
//   console.log('artifacts.plasma.WithdrawManager', artifacts.plasma.WithdrawManager.options.address)
//   return await artifacts.plasma.WithdrawManager.methods.processExits(tokenAddress).send({ from, gas })
// }

// async function deployShareToken() {
//   const compilerOutput = JSON.parse(await readFile(abis.predicate_contracts_output, 'utf8'));
//   const bytecode = Buffer.from(compilerOutput.contracts['reporting/ShareToken.sol']['ShareToken'].evm.bytecode.object, 'hex');
//   const shareToken = new web3.eth.Contract(abis.predicate.ShareToken);
//   return shareToken.deploy({ // returns new contract instance
//       data: '0x' + bytecode.toString('hex')
//   })
//   .send({ from: otherAccount, gas: 7500000 })
// }

// async function deployCash() {
//   const compilerOutput = JSON.parse(await readFile(abis.predicate_contracts_output, 'utf8'));
//   const bytecode = Buffer.from(compilerOutput.contracts['Cash.sol']['Cash'].evm.bytecode.object, 'hex');
//   const cash = new web3.eth.Contract(abis.predicate.Cash);
//   return cash.deploy({ // returns new contract instance
//       data: '0x' + bytecode.toString('hex')
//   })
//   .send({ from: otherAccount, gas: 7500000 })
// }


// export async function initializeExit(account) {
//   // For Exiting, we need a new version of shareToken and Cash
//   // This should be done by the predicate, but this is a temporary solution to work around bytecode too long (@todo fix)
//   const exitShareToken = await deployShareToken()
//   const exitCashToken = await deployCash()

//   console.log(
//       'initializeExit',
//       exitShareToken.options.address, 
//       exitCashToken.options.address
//   )

//   await artifacts.predicate.AugurPredicate.methods.initializeForExit(
//       exitShareToken.options.address, 
//       exitCashToken.options.address
//   ).send({ from: account, gas })

//   return { exitShareToken, exitCashToken }
// }

