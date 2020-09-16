import { increaseBlockTime } from './time'
import { Context } from 'mocha'

export async function processExits(this: Context, tokenAddress: string) {
  await increaseBlockTime.call(this, 14 * 86400)
  return await this.withdrawManager.from.processExits(tokenAddress)
}
