import { BytesLike, Signer } from "ethers";

import { utils } from 'ethers'

export function parseFullSets(sets: number): number {
  return sets * 100
}

// 0x signed message has different order or r,v,s values
export async function sign0x(message: BytesLike, signer: Signer): Promise<Buffer> {
  const signature = await signer.signMessage(message)
  const sig = utils.splitSignature(signature)
  return Buffer.concat([
    utils.arrayify(sig.v),
    utils.arrayify(sig.r),
    utils.arrayify(sig.s)
  ])
}
