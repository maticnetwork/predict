import { toBN } from '../../src/types'
import { expect } from 'chai'

export function shouldDepositCash(amount: number): void {
  describe('should deposit cash to Ethereum and Matic', function() {
    it('deposit on Ethereum', async function() {
      await this.cash.from.faucet(amount)
      await this.cash.other.faucet(amount)
      await this.cash.from.approve(this.augurPredicate.contract.address, amount)
      await this.cash.other.approve(this.augurPredicate.contract.address, amount)

      const beforeBalance = await this.rootOICash.contract.balanceOf(this.augurPredicate.contract.address)

      await this.augurPredicate.from.deposit(amount)
      await this.augurPredicate.other.deposit(amount)

      // expect('balanceOf').to.be.calledOnContractWith(rootOICash, [augurPredicate.address])
      // deposit contract has OI cash balance for the 2 accounts
      expect(await this.rootOICash.contract.balanceOf(this.augurPredicate.contract.address)).to.equal(toBN(beforeBalance).add(toBN(amount).mul(toBN(2))))
    })

    it('deposit on Matic', async function() {
      // This task is otherwise managed by Heimdall (our PoS layer)
      // mocking this step
      await this.maticCash.from.faucet(amount)
      await this.maticCash.other.faucet(amount)

      expect(await this.maticCash.contract.balanceOf(this.from)).to.equal(amount)
      expect(await this.maticCash.contract.balanceOf(this.otherFrom)).to.equal(amount)
    })
  })
}
