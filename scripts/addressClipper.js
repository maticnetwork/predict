const fs = require('fs')

const contracts = {}
fs.readFileSync("./deployedAddresses").toString().trim().split(/\n/g).forEach(l => {
  let pos = l.indexOf('Uploaded contract: ')
  if (pos == -1) return
  l = l.slice('Uploaded contract: '.length)
  let key = l.slice(0, l.indexOf(':'))
  l = l.slice(l.indexOf(':') + 3)
  let address = l.slice(0, l.length - 1)
  contracts[key] = address
})

// console.log(contracts)
fs.writeFileSync('../test/helpers/AugurContracts/addresses2.json', JSON.stringify(contracts, null, 2))
