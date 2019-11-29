const fs = require('fs')

const contracts = {}

fs.readFileSync("./output/child_deploy_output").toString().trim().split(/\n/g).forEach(l => {
  let key, address
  if (l.indexOf('Uploaded contract: ') != -1) {
    l = l.slice('Uploaded contract: '.length)
    key = l.slice(0, l.indexOf(':'))
    l = l.slice(l.indexOf(':') + 3)
    address = l.slice(0, l.length - 1)
  } else if (l.indexOf('Genesis universe address: ') != -1) {
    l = l.slice('Genesis universe address: '.length)
    key = 'Universe'
    l = l.slice(l.indexOf(':') + 1)
    address = l //.slice(0, l.length)
  }
  contracts[key] = address
})

// console.log(contracts)
fs.writeFileSync('./output/child_addresses.json', JSON.stringify(contracts, null, 2))
