// export function increaseBlockTime(web3, seconds) {
//   return new Promise((resolve, reject) => {
//     web3.currentProvider.send({
//       jsonrpc: '2.0',
//       method: 'evm_increaseTime',
//       params: [seconds],
//       id: new Date().getTime()
//     }, (err, result) => {
//       if (err) { return reject(err) }
//       return resolve(result)
//     })
//   })
// }
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

export function currentTime(): number {
  return new Date().getTime()
}
