import { providers } from 'ethers'
import { Context } from 'mocha'
import { EthProvider, MaticProvider } from 'src/providers'
import { ConnectedTime } from 'src/types'

async function increaseChainTime(time: ConnectedTime, provider: providers.JsonRpcProvider, seconds: number) {
  const block = await EthProvider.getBlock('latest')
  await time.from.setTimestamp(block.timestamp + seconds)
  await provider.send('evm_increaseTime', [seconds])
}

export async function increaseBlockTime(this: Context, seconds: number) {
  await Promise.all([
    increaseChainTime(this.time, EthProvider, seconds),
    increaseChainTime(this.maticTime, MaticProvider, seconds)
  ])
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
