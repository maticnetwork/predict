import { Contract, Signer } from 'ethers'

import { deployMarket } from './deployment/augur'
import { Context } from 'mocha'
import { Market } from 'typechain/augur/Market'

export interface MarketInfo {
  numTicks: number;
  address: string;
  currentTime: number;
  rootMarket: Market;
}

export async function createMarket(this: Context): Promise<MarketInfo> {
  // Create market on main chain augur
  let currentTime = (await this.augur.contract.getTimestamp()).toNumber()
  const rootMarket = await deployMarket(currentTime, 'augur-main')

  // sync time between ethereum and bor augur
  await this.maticTime.from.setTimestamp(currentTime)

  // Create corresponding market on Matic
  currentTime = (await this.maticAugur.contract.getTimestamp()).toNumber()
  const market = await deployMarket(currentTime, 'augur-matic')

  const numOutcomes = await rootMarket.getNumberOfOutcomes()
  const numTicks = (await rootMarket.getNumTicks()).toNumber()

  await this.predicateRegistry.from.mapMarket(
    market.address,
    rootMarket.address,
    numOutcomes,
    numTicks
  )

  return { numTicks, address: market.address, currentTime, rootMarket }
}
