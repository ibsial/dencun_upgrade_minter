import {JsonRpcProvider, Wallet} from 'ethers'
import {RPCs, mintEthereum, mintLinea, mode, retryCount, sleepBetweenWallets} from './config'
import {checkAndClaim} from './src/claimer'
import {RandomHelpers, c, defaultSleep, importAndValidatePrivates, importAndValidateProxies, sleep} from './src/utils/helpers'
import {EXPLORERS} from './src/utils/constants'

async function mintEthereumForAcc(index: number, signer: Wallet, proxy: string | undefined) {
    let res = await checkAndClaim(index, signer, 'ethereum', proxy, retryCount)
    if (res != '') {
        console.log(`[${index}] ${signer.address}`, c.green(EXPLORERS.ethereum + res))
    }
}
async function mintLineaForAcc(index: number, signer: Wallet, proxy: string | undefined) {
    let minted = 0
    while (mintLinea.amount > 0 && minted < mintLinea.amount) {
        let res = await checkAndClaim(index, signer, 'linea', proxy, retryCount)
        if (res != '') {
            console.log(`[${index}] ${signer.address}`, c.green(EXPLORERS.linea + res), `[${minted + 1}/${mintLinea.amount}]`)
        }
        minted++
        await defaultSleep(RandomHelpers.getRandomNumber(mintLinea.delay), false)
    }
}

async function main() {
    let privates = await importAndValidatePrivates('./privates.txt')
    let proxies = await importAndValidateProxies('./proxies.txt')
    privates = RandomHelpers.shuffleArray(privates)
    if (proxies.length > 0) {
        proxies = RandomHelpers.shuffleArray(proxies)
    }
    const ethProvider = new JsonRpcProvider(RPCs.ethereum, 1, {staticNetwork: true})
    const lineaProvider = new JsonRpcProvider(RPCs.linea, 59144, {staticNetwork: true})
    for (let i = 0; i < privates.length; i++) {
        if (mintEthereum) {
            let signer = new Wallet(privates[i], ethProvider)
            let proxy = proxies.length > 0 ? RandomHelpers.getRandomElementFromArray(proxies) : undefined
            console.log(c.bgMagenta(`starting ethereum mint for wallet #${i + 1}`), signer.address)
            if (mode == 'sync') {
                await mintEthereumForAcc(i + 1, signer, proxy)
            } else {
                mintEthereumForAcc(i + 1, signer, proxy)
            }
            await defaultSleep(10, false)
        }
        if (mintLinea.amount > 0) {
            let signer = new Wallet(privates[i], lineaProvider)
            console.log(c.bgMagenta(`starting linea mint for wallet #${i + 1}`), signer.address)
            let proxy = proxies.length > 0 ? RandomHelpers.getRandomElementFromArray(proxies) : undefined
            if (mode == 'sync') {
                await mintLineaForAcc(i + 1, signer, proxy)
            } else {
                mintLineaForAcc(i + 1, signer, proxy)
            }
        }
        if (mode == 'sync') {
            await sleep(RandomHelpers.getRandomNumber(sleepBetweenWallets))
        } else {
            await defaultSleep(RandomHelpers.getRandomNumber(sleepBetweenWallets), false)
        }
    }
}

main()
