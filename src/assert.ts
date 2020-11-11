import { expect } from 'chai'
import { BigNumberish } from 'ethers'
import { ShareToken } from 'typechain/augur/ShareToken'
import { SideChainShareToken } from 'typechain/augur/SideChainShareToken'

export async function assertTokenBalances(shareToken: ShareToken|SideChainShareToken, market: string, account: string, balances: BigNumberish[]): Promise<void> {
  for (let i = 0; i < balances.length; i++) {
    const outcome = await shareToken.balanceOfMarketOutcome(market, i, account)
    // console.log(`${i} balance is ${outcome.toString()} and expected to be ${balances[i].toString()}`)
    expect(outcome).to.be.eq(balances[i], `assert failed at index ${i}`)
  }
}
