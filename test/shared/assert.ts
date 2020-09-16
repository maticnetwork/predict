import { expect } from 'chai'
import { BigNumberish } from 'ethers'
import { ShareToken } from 'typechain/augur/ShareToken'

export async function assertTokenBalances(shareToken: ShareToken, market: string, account: string, balances: BigNumberish[]) {
  for (let i = 0; i < balances.length; i++) {
    const outcome = await shareToken.balanceOfMarketOutcome(market, i, account)
    expect(outcome).to.be.eq(balances[i])
  }
}
