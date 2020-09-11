import { Context } from 'mocha'
import { EthProvider, MaticProvider } from 'src/providers'

export async function increaseBlockTime(this: Context, seconds: number, forMatic: boolean) {
  let provider = EthProvider
  let time = this.time
  if (forMatic) {
    provider = MaticProvider
    time = this.maticTime
  }

  const block = await EthProvider.getBlock('latest')
  await time.from.setTimestamp(block.timestamp + seconds)
  await provider.send('evm_increaseTime', [seconds])
}
// export function mineOneBlock(web3) {
//   return web3.currentProvider.send(
//     {
//       jsonrpc: '2.0',
//       method: 'evm_mine',
//       id: new Date().getTime()
//     },
//     () => {}
//   )
// }


// export async function increaseTime(timestamp: BigNumber): Promise<void> {
//   await waffle.provider.send("evm_increaseTime", [timestamp.toNumber()]);
// }
