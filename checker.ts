import {JsonRpcProvider, Wallet} from 'ethers'
import {RPCs, mintEthereum, mintLinea, mode, retryCount, sleepBetweenWallets} from './config'
import {checkAndClaim} from './src/claimer'
import {RandomHelpers, c, defaultSleep, importAndValidatePrivates, importAndValidateProxies, sleep} from './src/utils/helpers'
import {EXPLORERS} from './src/utils/constants'
import {getBalance1155} from './src/utils/web3Client'

async function main() {
    let privates = await importAndValidatePrivates('./privates.txt')
    // let proxies = await importAndValidateProxies('./proxies.txt')
    // privates = RandomHelpers.shuffleArray(privates)
    // if (proxies.length > 0) {
    //     proxies = RandomHelpers.shuffleArray(proxies)
    // }
    // const ethProvider = new JsonRpcProvider(RPCs.ethereum, 1, {staticNetwork: true})
    const lineaProvider = new JsonRpcProvider(RPCs.linea, 59144, {staticNetwork: true})
    let stats = []
    for (let i = 0; i < privates.length; i++) {
        let signer = new Wallet(privates[i], lineaProvider)
        let balance = await getBalance1155(signer, signer.address, '0x9F44028C2F8959a5b15776e2FD936D5DC141B554', 1)
        console.log(c.bgMagenta(`#${i + 1}`), signer.address, '--> ', balance.toString())
        stats.push({
            address: signer.address,
            balance_linea: balance.toString()
        })
        await defaultSleep(0.5, false)
    }
    console.table(stats)
    let total = 0
    stats.forEach((val) => (total += Number(val.balance_linea)))
    console.log('TOTAL', c.bgMagenta(`${total}`))
}

main()
