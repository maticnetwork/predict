import { increaseBlockTime } from './time'
import { Context } from 'mocha'
import { ContractName } from 'src/types'
import { Market } from 'typechain/augur/Market'
import { DisputeWindow } from 'typechain/augur/DisputeWindow'
import { createContract } from 'src/deployedContracts'
import { ContractTransaction } from 'ethers'

export async function processExits(this: Context, tokenAddress: string) :Promise<ContractTransaction> {
  await increaseBlockTime.call(this, 14 * 86400)
  return await this.withdrawManager.from.processExits(tokenAddress)
}

export async function finalizeMarket(this: Context, market: Market) :Promise<void> {
  const endTime = await market.getEndTime()
  await this.time.from.setTimestamp(endTime.add(1))
  await market.doInitialReport([0, 100, 0], '', 0)
  // set timestamp to after designated dispute end
  const disputeWindow: DisputeWindow = createContract(await market.getDisputeWindow(), ContractName.DisputeWindow, 'augur-main')
  const disputeEndTime = await disputeWindow.getEndTime()
  await this.time.from.setTimestamp(disputeEndTime.add(1))
  await market.finalize()
}
